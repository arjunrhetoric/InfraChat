"use client";

import { useEffect, useState } from "react";

type Log = {
  id: string;
  action: string;
  createdAt: string | Date;
  details: string | null;
  metadata: unknown;
  performedBy: { id: string; username: string; role: number };
  targetUser: { id: string; username: string } | null;
  room: { id: string; name: string } | null;
};

const ACTIONS = [
  "USER_KICKED", "USER_BANNED", "USER_UNBANNED", "USER_MUTED", "USER_UNMUTED",
  "USER_PROMOTED", "USER_DEMOTED", "ROOM_ANNOUNCEMENT", "ROOM_CREATED",
  "ROOM_MEMBER_ADDED", "MESSAGE_DELETED",
];

function timeAgo(d: string | Date): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function actionIcon(action: string): string {
  if (action.includes("BAN")) return "⛔";
  if (action.includes("KICK")) return "🦵";
  if (action.includes("MUT")) return "🔇";
  if (action.includes("PROMOT")) return "⬆";
  if (action.includes("DEMOT")) return "⬇";
  if (action.includes("ANNOUNCE")) return "📢";
  if (action.includes("CREAT")) return "＋";
  if (action.includes("ADD")) return "＋";
  if (action.includes("DELET")) return "🗑";
  return "·";
}

function actionTone(action: string): string {
  if (action.includes("BAN") || action.includes("KICK") || action.includes("MUTED") || action.includes("DELETED")) return "danger";
  if (action.includes("PROMOT") || action.includes("DEMOT") || action.includes("UNBAN") || action.includes("UNMUT")) return "warn";
  if (action.includes("ANNOUNCE") || action.includes("CREATED") || action.includes("ADDED")) return "accent";
  return "";
}

export function AuditClient({ initialLogs, rooms, total }: {
  initialLogs: Log[];
  rooms: { id: string; name: string }[];
  total: number;
}) {
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [action, setAction] = useState("");
  const [roomId, setRoomId] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(total);

  async function run(nextAction = action, nextRoom = roomId) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (nextAction) params.set("action", nextAction);
      if (nextRoom) params.set("roomId", nextRoom);
      const res = await fetch(`/api/audit?${params}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs);
        setCount(data.pagination.total);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => run(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, roomId]);

  const filtered = q.trim()
    ? logs.filter((l) =>
        `${l.action} ${l.details ?? ""} ${l.performedBy.username} ${l.targetUser?.username ?? ""} ${l.room?.name ?? ""}`
          .toLowerCase().includes(q.toLowerCase()))
    : logs;

  return (
    <>
      <div className="ic-filter-bar">
        <input className="ic-input" style={{ width: 220 }} placeholder="Search actor, target, details…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
        <select className="ic-select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="ic-select" value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Filter by room">
          <option value="">All rooms</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>#{r.name}</option>)}
        </select>
        {(action || roomId) && <button className="ic-btn sm ghost" onClick={() => { setAction(""); setRoomId(""); }}>Clear</button>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }} className="ic-mono">
          {busy ? "loading…" : `${filtered.length} / ${count} events`}
        </span>
      </div>

      <div style={{ marginTop: 8 }}>
        {filtered.length === 0 && (
          <div className="ic-empty">
            <h3>No activity yet</h3>
            <p>Moderation and administrative events will appear here.</p>
          </div>
        )}
        {filtered.map((l) => {
          const open = expanded === l.id;
          return (
            <div key={l.id} className="ic-audit-row" onClick={() => setExpanded(open ? null : l.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setExpanded(open ? null : l.id); }}>
              <div className={`ic-audit-ico ${actionTone(l.action) === "danger" ? "red" : actionTone(l.action) === "warn" ? "amber" : actionTone(l.action) === "accent" ? "cyan" : "grey"}`}>{actionIcon(l.action)}</div>
              <div className="ic-audit-time" title={new Date(l.createdAt).toLocaleString()}>{timeAgo(l.createdAt)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`ic-badge mono ${actionTone(l.action)}`}>{l.action}</span>
                  <span style={{ fontSize: 13 }}>
                    <strong>{l.performedBy.username}</strong>
                    {l.targetUser && <span style={{ color: "var(--muted)" }}> → @{l.targetUser.username}</span>}
                    {l.room && <span style={{ color: "var(--accent)" }}> in #{l.room.name}</span>}
                  </span>
                </div>
                {l.details && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}>{l.details}</div>}
                {open && (
                  <dl className="ic-audit-detail" onClick={(e) => e.stopPropagation()}>
                    <dt>event id</dt><dd>{l.id}</dd>
                    <dt>action</dt><dd>{l.action}</dd>
                    <dt>actor</dt><dd>{l.performedBy.username} (role {l.performedBy.role})</dd>
                    <dt>target</dt><dd>{l.targetUser ? l.targetUser.username : "—"}</dd>
                    <dt>room</dt><dd>{l.room ? `#${l.room.name}` : "—"}</dd>
                    <dt>timestamp</dt><dd>{new Date(l.createdAt).toISOString().replace("T", " ").slice(0, 19)}</dd>
                    {l.metadata != null && <><dt>metadata</dt><dd>{JSON.stringify(l.metadata)}</dd></>}
                  </dl>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
