import { db } from "@/lib/db";
import { ROLES, roleName } from "@/lib/roles";
import { getRedis } from "@/lib/redis";
import { channels, events, trigger } from "@infrachat/realtime";

// Cooldown: Redis when configured (multi-instance safe), else in-memory.
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 3000;

async function checkCooldown(userId: string, command: string): Promise<number> {
  const redis = await getRedis();
  const key = `cooldown:${userId}:${command}`;
  if (redis) {
    try {
      const existing = await redis.get(key);
      if (existing) {
        const ttlMs = Number(existing) - Date.now();
        if (ttlMs > 0) return Math.ceil(ttlMs / 1000);
      }
      await redis.set(key, String(Date.now() + COOLDOWN_MS), { ex: 3, nx: false });
      // If key existed we already returned; fresh set means no cooldown.
      if (existing) return 0;
      return 0;
    } catch {
      /* fall through to memory */
    }
  }
  const memKey = `${userId}:${command}`;
  const now = Date.now();
  const last = cooldowns.get(memKey);
  if (last && now - last < COOLDOWN_MS) {
    return Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
  }
  cooldowns.set(memKey, now);
  return 0;
}

export type CommandContext = {
  userId: string;
  username: string;
  role: number;
  roomId: string;
  roomName: string;
};

export type CommandResult =
  | { kind: "reply"; message: string }
  | { kind: "broadcast"; message: string };

const KNOWN = [
  "/help",
  "/members",
  "/rooms",
  "/kick",
  "/mute",
  "/unmute",
  "/ban",
  "/unban",
  "/announce",
  "/promote",
  "/demote",
  "/audit",
];

const MOD_COMMANDS = ["/kick", "/mute", "/unmute", "/ban", "/unban", "/announce"];
const ADMIN_COMMANDS = ["/promote", "/demote", "/audit"];

export async function processCommand(
  raw: string,
  ctx: CommandContext
): Promise<CommandResult> {
  const parts = raw.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const targetUsername = parts[1];

  if (!KNOWN.includes(command)) {
    return {
      kind: "reply",
      message: `Unknown command "${command}". Use /help to see available commands.`,
    };
  }
  if (MOD_COMMANDS.includes(command) && ctx.role < ROLES.MODERATOR) {
    return { kind: "reply", message: "You do not have permission to use this command." };
  }
  if (ADMIN_COMMANDS.includes(command) && ctx.role < ROLES.SUPERADMIN) {
    return { kind: "reply", message: "This command requires SuperAdmin privileges." };
  }

  const remaining = await checkCooldown(ctx.userId, command);
  if (remaining > 0) {
    return { kind: "reply", message: `Command on cooldown. Try again in ${remaining} second(s).` };
  }

  type TargetUser = NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>>;
  const requireTarget = async (): Promise<{ error: string } | { target: TargetUser }> => {
    if (!targetUsername) return { error: `Usage: ${command} <username>` };
    const target = await db.user.findUnique({ where: { username: targetUsername } });
    if (!target) return { error: "Target user not found." };
    if (target.id === ctx.userId) return { error: "You cannot use this command on yourself." };
    if (target.role >= ctx.role) {
      return { error: "You cannot perform this action on a user with equal or higher privileges." };
    }
    return { target };
  };

  if (command === "/help") {
    let t = "Available commands:\n  /help — Show this help\n  /members — List room members\n  /rooms — List available rooms\n";
    if (ctx.role >= ROLES.MODERATOR)
      t += "  /kick <username>\n  /mute <username> [minutes]\n  /unmute <username>\n  /ban <username>\n  /unban <username>\n  /announce <message>\n";
    if (ctx.role >= ROLES.SUPERADMIN) t += "  /promote <username>\n  /demote <username>\n  /audit\n";
    return { kind: "reply", message: t };
  }

  if (command === "/members") {
    const members = await db.roomMember.findMany({
      where: { roomId: ctx.roomId },
      include: { user: { select: { username: true } } },
    });
    return { kind: "reply", message: `Room members: ${members.map((m) => m.user.username).join(", ")}` };
  }

  if (command === "/rooms") {
    const rooms = await db.room.findMany({
      where: { OR: [{ isPrivate: false }, { members: { some: { userId: ctx.userId } } }] },
      select: { name: true, roomType: true, isArchived: true, _count: { select: { members: true } } },
    });
    const lines = rooms.map(
      (r) => `  ${r.name} (${r.roomType}, ${r._count.members} members)${r.isArchived ? " [archived]" : ""}`
    );
    return { kind: "reply", message: `Available rooms:\n${lines.join("\n")}` };
  }

  if (command === "/kick" || command === "/ban" || command === "/unban") {
    const res = await requireTarget();
    if ("error" in res) return { kind: "reply", message: res.error };

    if (command === "/unban") {
      const ban = await db.roomBan.findUnique({
        where: { roomId_userId: { roomId: ctx.roomId, userId: res.target.id } },
      });
      if (!ban) return { kind: "reply", message: "Target user is not banned in this room." };
      await db.roomBan.delete({ where: { roomId_userId: { roomId: ctx.roomId, userId: res.target.id } } });
      await db.auditLog.create({
        data: { action: "USER_UNBANNED", performedById: ctx.userId, targetUserId: res.target.id, roomId: ctx.roomId, details: `${ctx.username} unbanned ${res.target.username} in ${ctx.roomName}` },
      });
      await trigger(channels.room(ctx.roomId), events.ROOM_LIST_UPDATED, { roomId: ctx.roomId });
      return { kind: "broadcast", message: `${res.target.username} has been unbanned by ${ctx.username}.` };
    }

    // kick + ban share member removal
    const membership = await db.roomMember.findUnique({
      where: { roomId_userId: { roomId: ctx.roomId, userId: res.target.id } },
    });
    const existingBan = await db.roomBan.findUnique({
      where: { roomId_userId: { roomId: ctx.roomId, userId: res.target.id } },
    });
    if (!membership && !existingBan) {
      return { kind: "reply", message: "Target user is not a member of this room." };
    }
    await db.$transaction([
      db.roomMember.deleteMany({ where: { roomId: ctx.roomId, userId: res.target.id } }),
      ...(command === "/ban" && !existingBan
        ? [db.roomBan.create({ data: { roomId: ctx.roomId, userId: res.target.id } })]
        : []),
      db.auditLog.create({
        data: {
          action: command === "/ban" ? "USER_BANNED" : "USER_KICKED",
          performedById: ctx.userId,
          targetUserId: res.target.id,
          roomId: ctx.roomId,
          details: `${ctx.username} ${command === "/ban" ? "banned" : "kicked"} ${res.target.username} in ${ctx.roomName}`,
        },
      }),
    ]);

    // FIX (old /ban bug): evict via personal channel for BOTH kick and ban.
    const evictEvent = command === "/ban" ? events.ROOM_BANNED : events.ROOM_KICKED;
    await Promise.all([
      trigger(channels.user(res.target.id), evictEvent, {
        roomId: ctx.roomId,
        roomName: ctx.roomName,
        message: `You have been ${command === "/ban" ? "banned from" : "kicked from"} ${ctx.roomName} by ${ctx.username}.`,
      }),
      trigger(channels.room(ctx.roomId), events.ROOM_MEMBER_REMOVED, {
        roomId: ctx.roomId,
        userId: res.target.id,
        username: res.target.username,
      }),
      trigger(channels.room(ctx.roomId), events.ROOM_LIST_UPDATED, { roomId: ctx.roomId }),
    ]);

    return {
      kind: "broadcast",
      message: `${res.target.username} has been ${command === "/ban" ? "banned" : "kicked"} by ${ctx.username}.`,
    };
  }

  if (command === "/mute" || command === "/unmute") {
    const res = await requireTarget();
    if ("error" in res) return { kind: "reply", message: res.error };
    if (command === "/unmute") {
      await db.user.update({ where: { id: res.target.id }, data: { isMuted: false, mutedUntil: null } });
      await db.auditLog.create({
        data: { action: "USER_UNMUTED", performedById: ctx.userId, targetUserId: res.target.id, roomId: ctx.roomId, details: `${ctx.username} unmuted ${res.target.username}` },
      });
      await trigger(channels.room(ctx.roomId), events.ROOM_UNMUTED, { userId: res.target.id });
      return { kind: "broadcast", message: `${res.target.username} has been unmuted by ${ctx.username}.` };
    }
    const mins = parseInt(parts[2] ?? "", 10);
    const hasDuration = !isNaN(mins) && mins > 0;
    const mutedUntil = hasDuration ? new Date(Date.now() + mins * 60_000) : null;
    await db.user.update({ where: { id: res.target.id }, data: { isMuted: true, mutedUntil } });
    await db.auditLog.create({
      data: {
        action: "USER_MUTED",
        performedById: ctx.userId,
        targetUserId: res.target.id,
        roomId: ctx.roomId,
        details: `${ctx.username} muted ${res.target.username}`,
        metadata: { durationMinutes: hasDuration ? mins : null },
      },
    });
    await trigger(channels.user(res.target.id), events.ROOM_MUTED, { roomId: ctx.roomId, mutedUntil });
    return {
      kind: "broadcast",
      message: hasDuration
        ? `${res.target.username} has been muted by ${ctx.username} for ${mins} minute(s).`
        : `${res.target.username} has been muted by ${ctx.username}.`,
    };
  }

  if (command === "/announce") {
    const text = parts.slice(1).join(" ").trim();
    if (!text) return { kind: "reply", message: "Usage: /announce <message>" };
    await db.room.update({
      where: { id: ctx.roomId },
      data: { announcementText: text.slice(0, 2000), announcementById: ctx.userId, announcementAt: new Date() },
    });
    await db.auditLog.create({
      data: { action: "ROOM_ANNOUNCEMENT", performedById: ctx.userId, roomId: ctx.roomId, details: `${ctx.username} announced in ${ctx.roomName}: ${text.slice(0, 200)}` },
    });
    await trigger(channels.room(ctx.roomId), events.ROOM_ANNOUNCEMENT, {
      roomId: ctx.roomId,
      text,
      setBy: ctx.username,
      setAt: new Date().toISOString(),
    });
    return { kind: "broadcast", message: `📢 Announcement by ${ctx.username}: ${text}` };
  }

  if (command === "/promote" || command === "/demote") {
    if (!targetUsername) return { kind: "reply", message: `Usage: ${command} <username>` };
    const target = await db.user.findUnique({ where: { username: targetUsername } });
    if (!target) return { kind: "reply", message: "Target user not found." };
    if (target.id === ctx.userId) return { kind: "reply", message: `You cannot ${command.slice(1)} yourself.` };

    if (command === "/promote") {
      if (target.role >= ROLES.SUPERADMIN) return { kind: "reply", message: "User is already at the highest role." };
      const newRole = Math.min(target.role + 1, ROLES.SUPERADMIN);
      await db.user.update({ where: { id: target.id }, data: { role: newRole } });
      await db.auditLog.create({
        data: { action: "USER_PROMOTED", performedById: ctx.userId, targetUserId: target.id, roomId: ctx.roomId, details: `${ctx.username} promoted ${target.username} from ${roleName(target.role)} to ${roleName(newRole)}` },
      });
      await trigger(channels.user(target.id), events.USER_ROLE_CHANGED, { userId: target.id, newRole });
      return { kind: "broadcast", message: `${target.username} promoted from ${roleName(target.role)} to ${roleName(newRole)} by ${ctx.username}.` };
    }

    if (target.role >= ctx.role) {
      return { kind: "reply", message: "You cannot demote a user with equal or higher privileges." };
    }
    if (target.role <= ROLES.MEMBER) return { kind: "reply", message: "User is already at the lowest role." };
    const newRole = Math.max(target.role - 1, ROLES.MEMBER);
    await db.user.update({ where: { id: target.id }, data: { role: newRole } });
    await db.auditLog.create({
      data: { action: "USER_DEMOTED", performedById: ctx.userId, targetUserId: target.id, roomId: ctx.roomId, details: `${ctx.username} demoted ${target.username} from ${roleName(target.role)} to ${roleName(newRole)}` },
    });
    await trigger(channels.user(target.id), events.USER_ROLE_CHANGED, { userId: target.id, newRole });
    return { kind: "broadcast", message: `${target.username} demoted from ${roleName(target.role)} to ${roleName(newRole)} by ${ctx.username}.` };
  }

  if (command === "/audit") {
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        performedBy: { select: { username: true } },
        targetUser: { select: { username: true } },
        room: { select: { name: true } },
      },
    });
    if (!logs.length) return { kind: "reply", message: "No audit logs found." };
    const lines = logs.map(
      (l) =>
        `  [${l.createdAt.toLocaleString()}] ${l.action}: ${l.performedBy.username}${l.targetUser ? ` → ${l.targetUser.username}` : ""}${l.room ? ` in ${l.room.name}` : ""}`
    );
    return { kind: "reply", message: `Recent audit logs:\n${lines.join("\n")}` };
  }

  return { kind: "reply", message: `Unknown command "${command}".` };
}
