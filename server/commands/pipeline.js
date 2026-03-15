const AuditLog = require('../models/AuditLog');
const Room = require('../models/Room');
const User = require('../models/User');
const { ROLES } = require('../middleware/rbac');
const { getUserSocketIds, removeUserFromRoom, getRoomOnlineUsers } = require('../socket/presence');

// ── Cooldown tracker ──
// Map<`userId:command` -> lastUsedTimestamp>
const cooldowns = new Map();
const COOLDOWN_MS = 3000; // 3 seconds between same command

const checkCooldown = (userId, command) => {
  const key = `${userId}:${command}`;
  const now = Date.now();
  const lastUsed = cooldowns.get(key);

  if (lastUsed && now - lastUsed < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 1000);
    return remaining;
  }

  cooldowns.set(key, now);
  return 0;
};

const processCommand = async (content, context) => {
  const { user, room, io, socket } = context;

  // ── Stage 1: Parse ──
  const parts = content.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const targetUsername = parts[1];
  const restArgs = parts.slice(2).join(' ');

  // ── Stage 2: Lookup ──
  const KNOWN_COMMANDS = [
    '/help', '/members', '/rooms', '/kick', '/mute', '/unmute',
    '/ban', '/unban', '/announce', '/promote', '/demote', '/audit',
  ];

  if (!KNOWN_COMMANDS.includes(command)) {
    return {
      broadcast: false,
      message: `Unknown command "${command}". Use /help to see available commands.`,
    };
  }

  // ── Stage 3: Permission ──
  const MODERATOR_COMMANDS = ['/kick', '/mute', '/unmute', '/ban', '/unban', '/announce'];
  const SUPERADMIN_COMMANDS = ['/promote', '/demote', '/audit'];

  if (MODERATOR_COMMANDS.includes(command) && user.role < ROLES.MODERATOR) {
    return {
      broadcast: false,
      message: 'You do not have permission to use this command.',
    };
  }

  if (SUPERADMIN_COMMANDS.includes(command) && user.role < ROLES.SUPERADMIN) {
    return {
      broadcast: false,
      message: 'This command requires SuperAdmin privileges.',
    };
  }

  // ── Stage 4: Cooldown ──
  const cooldownRemaining = checkCooldown(user._id.toString(), command);
  if (cooldownRemaining > 0) {
    return {
      broadcast: false,
      message: `Command on cooldown. Try again in ${cooldownRemaining} second(s).`,
    };
  }

  // ── Helpers ──
  const findTargetUser = async () => {
    if (!targetUsername) return null;
    return User.findOne({ username: targetUsername });
  };

  const isUserInRoom = (userId) => {
    return room.members.some((id) => id.toString() === userId.toString());
  };

  const isUserBannedInRoom = (userId) => {
    return room.bannedUsers.some((id) => id.toString() === userId.toString());
  };

  const requireTarget = async (cmd, usageHint) => {
    if (!targetUsername) {
      return { error: `Usage: ${cmd} ${usageHint}` };
    }
    const target = await findTargetUser();
    if (!target) {
      return { error: 'Target user not found.' };
    }
    if (target._id.toString() === user._id.toString()) {
      return { error: 'You cannot use this command on yourself.' };
    }
    if (target.role >= user.role) {
      return { error: 'You cannot perform this action on a user with equal or higher privileges.' };
    }
    return { target };
  };

  // ── Stage 5: Execute ──

  // /help
  if (command === '/help') {
    let helpText = 'Available commands:\n';
    helpText += '  /help — Show this help message\n';
    helpText += '  /members — List room members\n';
    helpText += '  /rooms — List available rooms\n';

    if (user.role >= ROLES.MODERATOR) {
      helpText += '  /kick <username> — Kick user from room\n';
      helpText += '  /mute <username> [minutes] — Mute a user\n';
      helpText += '  /unmute <username> — Unmute a user\n';
      helpText += '  /ban <username> — Ban user from room\n';
      helpText += '  /unban <username> — Unban user from room\n';
      helpText += '  /announce <message> — Set room announcement\n';
    }

    if (user.role >= ROLES.SUPERADMIN) {
      helpText += '  /promote <username> — Promote user role\n';
      helpText += '  /demote <username> — Demote user role\n';
      helpText += '  /audit — View recent audit logs\n';
    }

    return { broadcast: false, message: helpText };
  }

  // /members
  if (command === '/members') {
    await room.populate('members', 'username role');
    const memberNames = room.members.map((m) => m.username).join(', ');
    return { broadcast: false, message: `Room members: ${memberNames}` };
  }

  // /rooms
  if (command === '/rooms') {
    const rooms = await Room.find({
      $or: [{ isPrivate: false, roomType: { $ne: 'private' } }, { members: user._id }],
    }).select('name roomType members isArchived');

    const roomList = rooms.map((r) => {
      const memberCount = r.members.length;
      const type = r.roomType || 'public';
      const archived = r.isArchived ? ' [archived]' : '';
      return `  ${r.name} (${type}, ${memberCount} members)${archived}`;
    }).join('\n');

    return { broadcast: false, message: `Available rooms:\n${roomList}` };
  }

  // /kick <username>
  if (command === '/kick') {
    const result = await requireTarget('/kick', '<username>');
    if (result.error) return { broadcast: false, message: result.error };
    const { target } = result;

    if (!isUserInRoom(target._id)) {
      return { broadcast: false, message: 'Target user is not a member of this room.' };
    }

    room.members = room.members.filter(
      (id) => id.toString() !== target._id.toString()
    );
    room.moderators = room.moderators.filter(
      (id) => id.toString() !== target._id.toString()
    );
    await room.save();

    await AuditLog.create({
      action: 'USER_KICKED',
      performedBy: user._id,
      targetUser: target._id,
      room: room._id,
      details: `${user.username} kicked ${target.username} from room ${room.name}`,
    });

    // Remove kicked user from socket room and notify
    const targetSocketIds = getUserSocketIds(target._id.toString());
    for (const socketId of targetSocketIds) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.leave(room._id.toString());
        targetSocket.emit('room:kicked', {
          roomId: room._id,
          roomName: room.name,
          message: `You have been kicked from ${room.name} by ${user.username}.`,
        });
      }
    }

    removeUserFromRoom(room._id.toString(), target._id.toString());

    io.to(room._id.toString()).emit('room:onlineUsers', {
      roomId: room._id,
      users: getRoomOnlineUsers(room._id.toString()),
    });

    io.to(room._id.toString()).emit('room:member_removed', {
      roomId: room._id,
      userId: target._id,
      username: target.username,
    });

    return {
      broadcast: true,
      message: `${target.username} has been kicked from the room by ${user.username}.`,
    };
  }

  // /mute <username> [minutes]
  if (command === '/mute') {
    const result = await requireTarget('/mute', '<username> [minutes]');
    if (result.error) return { broadcast: false, message: result.error };
    const { target } = result;

    if (!isUserInRoom(target._id)) {
      return { broadcast: false, message: 'Target user is not a member of this room.' };
    }

    const durationMinutes = parseInt(parts[2], 10);
    if (!isNaN(durationMinutes) && durationMinutes > 0) {
      target.isMuted = true;
      target.mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    } else {
      target.isMuted = true;
      target.mutedUntil = null;
    }

    await target.save();

    await AuditLog.create({
      action: 'USER_MUTED',
      performedBy: user._id,
      targetUser: target._id,
      room: room._id,
      details: `${user.username} muted ${target.username}`,
      metadata: {
        durationMinutes: !isNaN(durationMinutes) && durationMinutes > 0 ? durationMinutes : null,
      },
    });

    io.to(room._id.toString()).emit('room:muted', {
      userId: target._id,
      username: target.username,
      roomId: room._id,
      mutedUntil: target.mutedUntil,
    });

    return {
      broadcast: true,
      message: target.mutedUntil
        ? `${target.username} has been muted by ${user.username} for ${durationMinutes} minute(s).`
        : `${target.username} has been muted by ${user.username}.`,
    };
  }

  // /unmute <username>
  if (command === '/unmute') {
    const result = await requireTarget('/unmute', '<username>');
    if (result.error) return { broadcast: false, message: result.error };
    const { target } = result;

    target.isMuted = false;
    target.mutedUntil = null;
    await target.save();

    await AuditLog.create({
      action: 'USER_UNMUTED',
      performedBy: user._id,
      targetUser: target._id,
      room: room._id,
      details: `${user.username} unmuted ${target.username}`,
    });

    return {
      broadcast: true,
      message: `${target.username} has been unmuted by ${user.username}.`,
    };
  }

  // /ban <username>
  if (command === '/ban') {
    const result = await requireTarget('/ban', '<username>');
    if (result.error) return { broadcast: false, message: result.error };
    const { target } = result;

    if (!isUserInRoom(target._id) && !isUserBannedInRoom(target._id)) {
      return { broadcast: false, message: 'Target user is not a member of this room.' };
    }

    if (!isUserBannedInRoom(target._id)) {
      room.bannedUsers.push(target._id);
    }

    room.members = room.members.filter(
      (id) => id.toString() !== target._id.toString()
    );
    room.moderators = room.moderators.filter(
      (id) => id.toString() !== target._id.toString()
    );
    await room.save();

    await AuditLog.create({
      action: 'USER_BANNED',
      performedBy: user._id,
      targetUser: target._id,
      room: room._id,
      details: `${user.username} banned ${target.username} from room ${room.name}`,
    });

    io.to(room._id.toString()).emit('user:banned', {
      userId: target._id,
      username: target.username,
      roomId: room._id,
    });

    return {
      broadcast: true,
      message: `${target.username} has been banned from the room by ${user.username}.`,
    };
  }

  // /unban <username>
  if (command === '/unban') {
    const result = await requireTarget('/unban', '<username>');
    if (result.error) return { broadcast: false, message: result.error };
    const { target } = result;

    if (!isUserBannedInRoom(target._id)) {
      return { broadcast: false, message: 'Target user is not banned in this room.' };
    }

    room.bannedUsers = room.bannedUsers.filter(
      (id) => id.toString() !== target._id.toString()
    );
    await room.save();

    await AuditLog.create({
      action: 'USER_UNBANNED',
      performedBy: user._id,
      targetUser: target._id,
      room: room._id,
      details: `${user.username} unbanned ${target.username} from room ${room.name}`,
    });

    return {
      broadcast: true,
      message: `${target.username} has been unbanned by ${user.username}.`,
    };
  }

  // /announce <message>
  if (command === '/announce') {
    const announcementText = parts.slice(1).join(' ').trim();

    if (!announcementText) {
      return { broadcast: false, message: 'Usage: /announce <message>' };
    }

    room.announcement = {
      text: announcementText,
      setBy: user._id,
      setAt: new Date(),
    };
    await room.save();

    await AuditLog.create({
      action: 'ROOM_ANNOUNCEMENT',
      performedBy: user._id,
      room: room._id,
      details: `${user.username} set announcement in ${room.name}: ${announcementText}`,
    });

    io.to(room._id.toString()).emit('room:announcement', {
      roomId: room._id,
      text: announcementText,
      setBy: { _id: user._id, username: user.username },
      setAt: room.announcement.setAt,
    });

    return {
      broadcast: true,
      message: `📢 Announcement by ${user.username}: ${announcementText}`,
    };
  }

  // /promote <username>
  if (command === '/promote') {
    if (!targetUsername) {
      return { broadcast: false, message: 'Usage: /promote <username>' };
    }

    const target = await findTargetUser();
    if (!target) {
      return { broadcast: false, message: 'Target user not found.' };
    }
    if (target._id.toString() === user._id.toString()) {
      return { broadcast: false, message: 'You cannot promote yourself.' };
    }

    if (target.role >= ROLES.SUPERADMIN) {
      return { broadcast: false, message: 'User is already at the highest role.' };
    }

    const oldRole = target.role;
    target.role = Math.min(target.role + 1, ROLES.SUPERADMIN);
    await target.save();

    const roleNames = { 1: 'Member', 2: 'Moderator', 3: 'SuperAdmin' };

    await AuditLog.create({
      action: 'USER_PROMOTED',
      performedBy: user._id,
      targetUser: target._id,
      room: room._id,
      details: `${user.username} promoted ${target.username} from ${roleNames[oldRole]} to ${roleNames[target.role]}`,
    });

    // Emit role change event to all of target user's sockets
    const targetSocketIds = getUserSocketIds(target._id.toString());
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('user:role_changed', {
        userId: target._id,
        username: target.username,
        oldRole,
        newRole: target.role,
      });
    });

    return {
      broadcast: true,
      message: `${target.username} has been promoted from ${roleNames[oldRole]} to ${roleNames[target.role]} by ${user.username}.`,
    };
  }

  // /demote <username>
  if (command === '/demote') {
    if (!targetUsername) {
      return { broadcast: false, message: 'Usage: /demote <username>' };
    }

    const target = await findTargetUser();
    if (!target) {
      return { broadcast: false, message: 'Target user not found.' };
    }
    if (target._id.toString() === user._id.toString()) {
      return { broadcast: false, message: 'You cannot demote yourself.' };
    }

    if (target.role >= user.role) {
      return { broadcast: false, message: 'You cannot demote a user with equal or higher privileges.' };
    }

    if (target.role <= ROLES.MEMBER) {
      return { broadcast: false, message: 'User is already at the lowest role.' };
    }

    const oldRole = target.role;
    target.role = Math.max(target.role - 1, ROLES.MEMBER);
    await target.save();

    const roleNames = { 1: 'Member', 2: 'Moderator', 3: 'SuperAdmin' };

    await AuditLog.create({
      action: 'USER_DEMOTED',
      performedBy: user._id,
      targetUser: target._id,
      room: room._id,
      details: `${user.username} demoted ${target.username} from ${roleNames[oldRole]} to ${roleNames[target.role]}`,
    });

    const targetSocketIds = getUserSocketIds(target._id.toString());
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('user:role_changed', {
        userId: target._id,
        username: target.username,
        oldRole,
        newRole: target.role,
      });
    });

    return {
      broadcast: true,
      message: `${target.username} has been demoted from ${roleNames[oldRole]} to ${roleNames[target.role]} by ${user.username}.`,
    };
  }

  // /audit
  if (command === '/audit') {
    const logs = await AuditLog.find()
      .populate('performedBy', 'username')
      .populate('targetUser', 'username')
      .populate('room', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    if (logs.length === 0) {
      return { broadcast: false, message: 'No audit logs found.' };
    }

    const logLines = logs.map((log) => {
      const actor = log.performedBy?.username || 'Unknown';
      const target = log.targetUser?.username ? ` → ${log.targetUser.username}` : '';
      const roomName = log.room?.name ? ` in ${log.room.name}` : '';
      const time = log.createdAt.toLocaleString();
      return `  [${time}] ${log.action}: ${actor}${target}${roomName}`;
    }).join('\n');

    return { broadcast: false, message: `Recent audit logs:\n${logLines}` };
  }

  return {
    broadcast: false,
    message: `Unknown command "${command}". Use /help to see available commands.`,
  };
};

module.exports = { processCommand };
