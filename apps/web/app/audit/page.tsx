import { auth } from "@/auth";
import { db } from "@/lib/db";
import { AuditClient } from "./audit-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await auth();
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (role < 2)
    return (
      <div className="ic-page">
        <div className="ic-page-head"><a href="/" style={{ fontSize: 13 }}>← Back</a><h2 style={{ margin: "6px 0 0" }}>Audit log</h2></div>
        <div className="ic-container"><div className="ic-error">Moderator+ only — you don&apos;t have permission to view the audit log.</div></div>
      </div>
    );

  const [logs, total, rooms] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        performedBy: { select: { id: true, username: true, role: true } },
        targetUser: { select: { id: true, username: true } },
        room: { select: { id: true, name: true } },
      },
    }),
    db.auditLog.count(),
    db.room.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="ic-page">
      <div className="ic-page-head">
        <a href="/" style={{ fontSize: 13, color: "var(--muted)" }}>← Back to workspace</a>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Audit log</h2>
          <span className="ic-badge mono">append-only</span>
        </div>
      </div>
      <div className="ic-container" style={{ maxWidth: 900, paddingTop: 16 }}>
        <AuditClient initialLogs={logs} rooms={rooms} total={total} />
      </div>
    </div>
  );
}
