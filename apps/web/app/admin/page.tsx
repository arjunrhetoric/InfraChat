import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

function roleLabel(r: number) {
  return r >= 3 ? "SuperAdmin" : r === 2 ? "Moderator" : "Member";
}

export default async function AdminPage() {
  const session = await auth();
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  const meId = (session?.user as { id?: string } | undefined)?.id;
  if (role < 3)
    return (
      <div className="ic-page">
        <div className="ic-page-head"><a href="/" style={{ fontSize: 13 }}>← Back</a><h2 style={{ margin: "6px 0 0" }}>Admin</h2></div>
        <div className="ic-container"><div className="ic-error">SuperAdmin only — you don&apos;t have permission to manage roles.</div></div>
      </div>
    );

  const [users, rooms, recentBans] = await Promise.all([
    db.user.findMany({
      select: { id: true, username: true, email: true, role: true, isBanned: true },
      orderBy: { username: "asc" },
    }),
    db.room.findMany({
      select: { id: true, name: true, roomType: true, isPrivate: true, isArchived: true, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    }),
    db.auditLog.count({ where: { action: { in: ["USER_BANNED", "USER_KICKED", "USER_MUTED"] } } }),
  ]);

  async function setRole(form: FormData) {
    "use server";
    const { auth: authFn } = await import("@/auth");
    const s = await authFn();
    if (((s?.user as { role?: number })?.role ?? 0) < 3) throw new Error("Forbidden");
    const { db: dbInner } = await import("@/lib/db");
    const id = String(form.get("id"));
    const newRole = Number(form.get("role"));
    if (![1, 2, 3].includes(newRole)) throw new Error("Bad role");
    if (id === (s?.user as { id?: string })?.id && newRole !== 3) throw new Error("Cannot demote self");
    const target = await dbInner.user.findUnique({ where: { id } });
    if (!target) throw new Error("Not found");
    await dbInner.$transaction([
      dbInner.user.update({ where: { id }, data: { role: newRole } }),
      dbInner.auditLog.create({
        data: {
          action: newRole > target.role ? "USER_PROMOTED" : "USER_DEMOTED",
          performedById: (s?.user as { id: string }).id,
          targetUserId: id,
          details: `Role ${target.role} → ${newRole} (admin panel)`,
        },
      }),
    ]);
    revalidatePath("/admin");
  }

  return (
    <div className="ic-page">
      <div className="ic-page-head">
        <a href="/" style={{ fontSize: 13, color: "var(--muted)" }}>← Back to workspace</a>
        <h2 style={{ margin: "6px 0 0", fontSize: 18 }}>Administration</h2>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span className="ic-badge">{users.length} users</span>
          <span className="ic-badge">{rooms.length} rooms</span>
          <span className="ic-badge danger">{recentBans} moderation actions</span>
          <a className="ic-badge accent" href="/audit" style={{ textDecoration: "none" }}>audit log →</a>
        </div>
      </div>
      <div className="ic-container" style={{ maxWidth: 860 }}>
        <div className="ic-label" style={{ margin: "4px 0 10px" }}>Members &amp; roles</div>
        {users.map((u) => (
          <div key={u.id} className="ic-table-row">
            <span className="ic-avatar sm" style={{ background: "linear-gradient(135deg,#38bdf8,#818cf8)" }}>
              {u.username.slice(0, 2).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>@{u.username}{u.id === meId && <span style={{ color: "var(--muted)", fontWeight: 500 }}> (you)</span>}</div>
              <div className="ic-mono" style={{ fontSize: 11, color: "var(--muted)" }}>{u.email}</div>
            </div>
            <span className={`ic-badge${u.role >= 3 ? " accent" : u.role === 2 ? " warn" : ""}`}>{roleLabel(u.role)}</span>
            {u.isBanned && <span className="ic-badge danger">banned</span>}
            <form action={setRole} style={{ display: "flex", gap: 6 }}>
              <input type="hidden" name="id" value={u.id} />
              <select name="role" defaultValue={u.role} className="ic-select" style={{ width: 132 }} disabled={u.id === meId} aria-label={`Role for ${u.username}`}>
                <option value={1}>Member</option>
                <option value={2}>Moderator</option>
                <option value={3}>SuperAdmin</option>
              </select>
              <button className="ic-btn sm" disabled={u.id === meId}>Save</button>
            </form>
          </div>
        ))}

        <div className="ic-label" style={{ margin: "26px 0 10px" }}>Rooms</div>
        {rooms.map((r) => (
          <div key={r.id} className="ic-table-row">
            <span className="ic-hash">#</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r._count.members} members</div>
            </div>
            <span className="ic-badge mono">{r.roomType}</span>
            {r.isPrivate && <span className="ic-badge">private</span>}
            {r.isArchived && <span className="ic-badge warn">archived</span>}
          </div>
        ))}

        <div className="ic-label" style={{ margin: "26px 0 10px" }}>Commands &amp; permissions</div>
        <div className="ic-card ic-mono" style={{ fontSize: 12, color: "var(--text-dim)", display: "grid", gap: 4 }}>
          <div><span style={{ color: "var(--accent)" }}>/kick /mute /unmute /ban /unban /announce</span> — Moderator+</div>
          <div><span style={{ color: "var(--accent)" }}>/promote /demote /audit</span> — SuperAdmin</div>
          <div><span style={{ color: "var(--accent)" }}>/help /members /rooms</span> — Everyone</div>
        </div>
      </div>
    </div>
  );
}
