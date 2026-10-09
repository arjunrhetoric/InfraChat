"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { signOut } from "next-auth/react";
import { channels, events } from "@infrachat/realtime";
import {
  COMMANDS,
  avatarColor,
  dayLabel,
  formatDateTime,
  formatTime,
  initials,
  roleName,
} from "@/components/command-data";

type Room = {
  id: string;
  name: string;
  description: string;
  roomType: string;
  isPrivate: boolean;
  isArchived: boolean;
  announcementText: string;
  announcementBy?: { username: string } | null;
  _count?: { members: number };
};
type ChatUser = { id: string; username: string; role: number };
type Attachment = { url: string; name: string; size?: number; mime?: string; type?: string };
type Message = {
  id: string;
  content: string;
  type: string;
  edited: boolean;
  deletedForEveryone?: boolean;
  createdAt: string;
  sender: { id: string; username: string };
  attachments?: Attachment[];
};
type Selected = { kind: "room"; id: string } | { kind: "dm"; id: string };
type Toast = { id: number; text: string };
type PopUser = { id: string; username: string; role: number; online: boolean };

let toastId = 0;

export function WorkspaceClient({
  initialRooms,
  users,
  me,
}: {
  initialRooms: Room[];
  users: ChatUser[];
  me: ChatUser;
}) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [selected, setSelected] = useState<Selected | null>(
    initialRooms[0] ? { kind: "room", id: initialRooms[0].id } : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<{ user: ChatUser }[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [connState, setConnState] = useState<"connected" | "reconnecting">("connected");
  const [unreadRooms, setUnreadRooms] = useState<Record<string, number>>({});
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [roomForm, setRoomForm] = useState({ name: "", description: "", roomType: "public" });
  const [showCreate, setShowCreate] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  const [sideOpen, setSideOpen] = useState(false);
  const [popUser, setPopUser] = useState<PopUser | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<Selected | null>(null);
  selectedRef.current = selected;
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selectedRoom = selected?.kind === "room" ? rooms.find((r) => r.id === selected.id) ?? null : null;
  const selectedDmUser = selected?.kind === "dm" ? users.find((u) => u.id === selected.id) ?? null : null;
  const canSendRoom = selectedRoom
    ? !selectedRoom.isArchived && !(selectedRoom.roomType === "broadcast" && me.role < 2)
    : true;
  const isDm = selected?.kind === "dm";

  function toast(text: string) {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }

  const refreshRooms = useCallback(async () => {
    const res = await fetch("/api/rooms");
    if (res.ok) {
      const data = await res.json();
      setRooms(data.rooms);
    }
  }, []);

  const loadMessages = useCallback(async (sel: Selected, pageNum = 1) => {
    const PAGE_SIZE = 50;
    if (pageNum === 1) setLoadingMsgs(true);
    try {
      if (sel.kind === "room") {
        const res = await fetch(`/api/rooms/${sel.id}/messages?limit=${PAGE_SIZE}&page=${pageNum}`);
        const data = await res.json();
        if (res.ok) {
          setMessages((prev) => (pageNum === 1 ? data.messages : [...data.messages, ...prev]));
          setHasMore((data.pagination?.total ?? 0) > pageNum * PAGE_SIZE);
          setPage(pageNum);
          if (data.room?.announcementText) setNotice(data.room.announcementText);
        }
        const mres = await fetch(`/api/rooms/${sel.id}/members`);
        if (mres.ok) {
          const mdata = await mres.json();
          setMembers(mdata.members.map((m: { user: ChatUser }) => ({ user: m.user })));
        }
      } else {
        const res = await fetch(`/api/direct-messages/${sel.id}?limit=50&page=${pageNum}`);
        const data = await res.json();
        if (res.ok) {
          setMessages((prev) => (pageNum === 1 ? data.messages : [...data.messages, ...prev]));
          setHasMore((data.pagination?.total ?? 0) > pageNum * 50);
          setPage(pageNum);
        }
        setMembers([]);
      }
    } finally {
      if (pageNum === 1) setLoadingMsgs(false);
    }
  }, []);

  async function loadOlder() {
    if (!selected || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await loadMessages(selected, page + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (selected) {
      loadMessages(selected);
      setError("");
      setTypingUsers([]);
      if (selected.kind === "room") {
        setUnreadRooms((u) => ({ ...u, [selected.id]: 0 }));
      }
      setSideOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.kind, selected?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Personal channel: subscribe ONCE.
  useEffect(() => {
    const pusher = getPusherClient();
    const personal = pusher.subscribe(channels.user(me.id));
    const evicted = (p: { roomId: string; message?: string }) => {
      setRooms((r) => r.filter((x) => x.id !== p.roomId));
      if (selectedRef.current?.kind === "room" && selectedRef.current.id === p.roomId) {
        setSelected((s) => (s && s.kind === "room" && s.id === p.roomId ? null : s));
        setMessages([]);
        setError(p.message ?? "You were removed from this room.");
      }
      toast(p.message ?? "You were removed from a room.");
    };
    const onMuted = () => {
      setError("You have been muted.");
      toast("You have been muted.");
    };
    const onRole = () => window.location.reload();
    const onList = () => refreshRooms();
    personal.bind(events.ROOM_KICKED, evicted);
    personal.bind(events.ROOM_BANNED, evicted);
    personal.bind(events.ROOM_MUTED, onMuted);
    personal.bind(events.USER_ROLE_CHANGED, onRole);
    const global = pusher.subscribe(channels.globalPresence());
    global.bind(events.ROOM_LIST_UPDATED, onList);
    const syncPresence = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = (global as any).members;
      if (m) {
        const ids: string[] = [];
        m.each((id: string) => ids.push(id));
        setOnlineIds(ids);
      }
    };
    global.bind("pusher:subscription_succeeded", syncPresence);
    global.bind("pusher:member_added", syncPresence);
    global.bind("pusher:member_removed", syncPresence);
    const onConn = (s: string) => setConnState(s === "connected" ? "connected" : "reconnecting");
    pusher.connection.bind("connected", () => onConn("connected"));
    pusher.connection.bind("disconnected", () => onConn("reconnecting"));
    pusher.connection.bind("connecting", () => onConn("reconnecting"));
    pusher.connection.bind("unavailable", () => onConn("reconnecting"));
    return () => {
      personal.unbind(events.ROOM_KICKED, evicted);
      personal.unbind(events.ROOM_BANNED, evicted);
      personal.unbind(events.ROOM_MUTED, onMuted);
      personal.unbind(events.USER_ROLE_CHANGED, onRole);
      global.unbind(events.ROOM_LIST_UPDATED, onList);
      pusher.unsubscribe(channels.user(me.id));
      pusher.unsubscribe(channels.globalPresence());
    };
  }, [me.id, refreshRooms]);

  // Room/DM channel: re-subscribe only when selection changes, with cleanup.
  useEffect(() => {
    if (!selected) return;
    const pusher = getPusherClient();
    const chanName = selected.kind === "room" ? channels.room(selected.id) : channels.dm(me.id, selected.id);
    const chan = pusher.subscribe(chanName);
    const onMessage = (payload: { message: Message }) => {
      const sel = selectedRef.current;
      const belongsHere =
        (sel?.kind === "room" && payload.message && chanName === channels.room(sel.id)) ||
        sel?.kind === "dm";
      if (belongsHere) {
        setMessages((m) => {
          if (m.some((x) => x.id === payload.message.id)) {
            return m.map((x) => (x.id === payload.message.id ? payload.message : x));
          }
          return [...m, payload.message];
        });
      }
    };
    const onTyping = (p: { username: string; isTyping: boolean }) => {
      if (p.username === me.username) return;
      setTypingUsers((t) => (p.isTyping ? [...new Set([...t, p.username])] : t.filter((x) => x !== p.username)));
    };
    const onAnnouncement = (p: { text: string }) => setNotice(p.text);
    const onMemberRemoved = () => {
      const sel = selectedRef.current;
      if (sel) loadMessages(sel);
    };
    chan.bind(events.MESSAGE_NEW, onMessage);
    chan.bind(events.DM_NEW, onMessage);
    chan.bind(events.TYPING_UPDATE, onTyping);
    chan.bind(events.ROOM_ANNOUNCEMENT, onAnnouncement);
    chan.bind(events.ROOM_MEMBER_REMOVED, onMemberRemoved);
    return () => {
      chan.unbind(events.MESSAGE_NEW, onMessage);
      chan.unbind(events.DM_NEW, onMessage);
      chan.unbind(events.TYPING_UPDATE, onTyping);
      chan.unbind(events.ROOM_ANNOUNCEMENT, onAnnouncement);
      chan.unbind(events.ROOM_MEMBER_REMOVED, onMemberRemoved);
      pusher.unsubscribe(chanName);
    };
  }, [selected?.kind, selected?.id, me.id, me.username, loadMessages]);

  // Background room unread badges.
  useEffect(() => {
    const pusher = getPusherClient();
    rooms.forEach((r) => {
      if (selectedRef.current?.kind === "room" && selectedRef.current.id === r.id) return;
      const name = channels.room(r.id);
      try {
        const c = pusher.subscribe(name);
        const cb = () => setUnreadRooms((u) => ({ ...u, [r.id]: (u[r.id] ?? 0) + 1 }));
        c.bind(events.MESSAGE_NEW, cb);
      } catch {
        /* private channel auth may fail for non-members — skip */
      }
    });
    return () => {
      rooms.forEach((r) => {
        if (selectedRef.current?.kind === "room" && selectedRef.current.id === r.id) return;
        try {
          pusher.unsubscribe(channels.room(r.id));
        } catch {
          /* noop */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms.map((r) => r.id).join(",")]);

  // Global keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        setSearchOpen(false);
        setShortcutsOpen(false);
        setPopUser(null);
        return;
      }
      if (inInput) return;
      if (e.key === "?") setShortcutsOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function emitTyping(isTyping: boolean) {
    if (selected?.kind !== "room") return;
    fetch(`/api/rooms/${selected.id}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTyping }),
    }).catch(() => {});
  }

  function onTextChange(v: string) {
    setText(v);
    setSlashIdx(0);
    if (selected?.kind !== "room") return;
    emitTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emitTyping(false), 1500);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const uploaded: Attachment[] = [];
      for (const f of Array.from(files).slice(0, 5 - pendingFiles.length)) {
        if (f.size > 10 * 1024 * 1024) {
          setError(`"${f.name}" exceeds 10MB — skipped.`);
          continue;
        }
        const form = new FormData();
        form.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? `Upload failed for ${f.name}.`);
          continue;
        }
        uploaded.push(data.file);
      }
      setPendingFiles((p) => [...p, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  async function send(raw?: string) {
    if (!selected) return;
    const content = raw ?? text;
    if (!content.trim() && pendingFiles.length === 0) return;
    setError("");
    const payload = { content, attachments: pendingFiles };
    const url =
      selected.kind === "room"
        ? `/api/rooms/${selected.id}/messages`
        : `/api/direct-messages/${selected.id}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Failed to send.");
      return;
    }
    if (data.command?.kind === "reply") {
      setMessages((m) => [...m, data.message]);
    }
    setText("");
    setPendingFiles([]);
    emitTyping(false);
    composerRef.current?.focus();
  }

  async function saveEdit(id: string, isDmSel: boolean) {
    const url = isDmSel ? `/api/dm-messages/${id}` : `/api/messages/${id}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editText }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.message ?? "Edit failed.");
      return;
    }
    setEditingId(null);
    setEditText("");
  }

  async function deleteMessage(id: string, isDmSel: boolean) {
    const url = isDmSel ? `/api/dm-messages/${id}` : `/api/messages/${id}`;
    const res = await fetch(url, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) {
      const d = await res.json();
      setError(d.message ?? "Delete failed.");
    }
  }

  function copyMessage(content: string) {
    navigator.clipboard?.writeText(content).then(() => toast("Copied to clipboard")).catch(() => {});
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(roomForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Create failed.");
      return;
    }
    setRoomForm({ name: "", description: "", roomType: "public" });
    setShowCreate(false);
    await refreshRooms();
    setSelected({ kind: "room", id: data.room.id });
  }

  async function joinLeave(join: boolean) {
    if (selected?.kind !== "room") return;
    const res = await fetch(`/api/rooms/${selected.id}/${join ? "join" : "leave"}`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json();
      setError(d.message ?? "Failed.");
      return;
    }
    await refreshRooms();
    if (!join) setSelected(null);
    else if (selected) loadMessages(selected);
  }

  async function toggleArchive() {
    if (!selectedRoom) return;
    const res = await fetch(`/api/rooms/${selectedRoom.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !selectedRoom.isArchived }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.message ?? "Failed.");
      return;
    }
    await refreshRooms();
  }

  async function deleteRoom() {
    if (!selectedRoom || !confirm(`Delete #${selectedRoom.name}?`)) return;
    const res = await fetch(`/api/rooms/${selectedRoom.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      setError(d.message ?? "Failed.");
      return;
    }
    setSelected(null);
    await refreshRooms();
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (selected?.kind !== "room" || !addUserId) return;
    const res = await fetch(`/api/rooms/${selected.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addUserId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.message ?? "Add failed.");
      return;
    }
    setAddUserId("");
    loadMessages(selected);
    toast("Member added.");
  }

  async function kickMember(uid: string) {
    if (selected?.kind !== "room") return;
    const res = await fetch(`/api/rooms/${selected.id}/members/${uid}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      setError(d.message ?? "Remove failed.");
      return;
    }
    loadMessages(selected);
    toast("Member removed.");
  }

  async function quickMod(cmd: string, username: string, extra = "") {
    if (selected?.kind !== "room") {
      toast("Open a room first — moderation commands run in a room.");
      return;
    }
    const full = `${cmd} ${username}${extra ? ` ${extra}` : ""}`;
    await send(full);
    setPopUser(null);
  }

  // ---- slash autocomplete ----
  const slashQuery = text.startsWith("/") && !text.includes("\n") ? text.slice(1).split(" ")[0].toLowerCase() : null;
  const slashMatches = useMemo(() => {
    if (slashQuery === null || isDm) return [];
    return COMMANDS.filter(
      (c) => me.role >= c.minRole && c.name.slice(1).startsWith(slashQuery)
    );
  }, [slashQuery, me.role, isDm]);
  const showSlash = slashQuery !== null && !isDm && slashMatches.length > 0;

  function applySlash(cmd: string) {
    const rest = text.slice(("/" + (slashQuery ?? "")).length);
    setText(cmd + (rest.startsWith(" ") ? rest : rest ? ` ${rest.trimStart()}` : " "));
    composerRef.current?.focus();
  }

  // ---- derived lists ----
  const publicRooms = rooms.filter((r) => !r.isPrivate);
  const privateRooms = rooms.filter((r) => r.isPrivate);
  const onlineUsers = users.filter((u) => onlineIds.includes(u.id));
  const totalUnread = Object.values(unreadRooms).reduce((a, b) => a + b, 0);

  const groupedMembers = useMemo(() => {
    const mods = members.filter((m) => m.user.role >= 2);
    const rest = members.filter((m) => m.user.role < 2);
    const on = (u: ChatUser) => onlineIds.includes(u.id);
    const sort = (a: { user: ChatUser }, b: { user: ChatUser }) =>
      Number(on(b.user)) - Number(on(a.user)) || a.user.username.localeCompare(b.user.username);
    return { mods: [...mods].sort(sort), rest: [...rest].sort(sort) };
  }, [members, onlineIds]);

  function openProfile(userId: string) {
    const full = members.find((x) => x.user.id === userId)?.user ?? users.find((x) => x.id === userId);
    if (full) setPopUser({ id: full.id, username: full.username, role: full.role, online: onlineIds.includes(full.id) });
  }

  function renderMessage(m: Message, i: number) {
    const prev = messages[i - 1];
    const sameAuthor = prev && prev.sender.id === m.sender.id;
    const prevTime = prev ? new Date(prev.createdAt).getTime() : 0;
    const curTime = new Date(m.createdAt).getTime();
    const showHead = !sameAuthor || curTime - prevTime > 5 * 60_000 || m.type === "command";
    const mine = m.sender.id === me.id;
    const senderRole = users.find((u) => u.id === m.sender.id)?.role ?? members.find((x) => x.user.id === m.sender.id)?.user.role ?? 1;
    const nameClass = senderRole >= 3 ? "ic-msg-author ic-name-admin" : senderRole === 2 ? "ic-msg-author ic-name-mod" : "ic-msg-author";
    if (editingId === m.id) {
      return (
        <div key={m.id} className={`ic-msg${showHead ? " show-head" : ""}`}>
          {showHead && (
            <div>
              <span className={nameClass} onClick={() => openProfile(m.sender.id)} title={`Open profile of ${m.sender.username}`}>{m.sender.username}</span>
              <span className="ic-msg-time">{formatDateTime(m.createdAt)}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input className="ic-input" value={editText} onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m.id, !!isDm); if (e.key === "Escape") setEditingId(null); }} autoFocus />
            <button className="ic-btn sm primary" onClick={() => saveEdit(m.id, !!isDm)}>Save</button>
            <button className="ic-btn sm" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </div>
      );
    }
    return (
      <div key={m.id} id={`msg-${m.id}`} className={`ic-msg${showHead ? " show-head" : ""}${m.type === "command" ? " cmd" : ""}`}>
        {showHead && (
          <>
            <div className="ic-msg-avatar" style={{ background: avatarColor(m.sender.username) }} aria-hidden>
              {initials(m.sender.username)}
            </div>
            <div>
              <span className={nameClass} onClick={() => openProfile(m.sender.id)} title={`Open profile of ${m.sender.username}`}>{m.sender.username}</span>
              <span className="ic-msg-time" title={new Date(m.createdAt).toLocaleString()}>{formatTime(m.createdAt)}</span>
              {m.edited && <span className="ic-msg-time">(edited)</span>}
              {m.type === "command" && <span className="ic-badge mono" style={{ marginLeft: 8 }}>command</span>}
            </div>
          </>
        )}
        {!showHead && (
          <span className="ic-msg-time" style={{ marginLeft: 0 }} title={new Date(m.createdAt).toLocaleString()}>
            {formatTime(m.createdAt)}
          </span>
        )}
        <div className="ic-msg-body" style={showHead ? undefined : { marginTop: 1 }}>
          {m.deletedForEveryone ? <em style={{ color: "var(--muted)" }}>{m.content}</em> : linkify(m.content)}
        </div>
        {(m.attachments ?? []).map((a, ai) => (
          <div key={ai}>
            <span className="ic-attach">📎 <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a></span>
          </div>
        ))}
        {!m.deletedForEveryone && (
          <div className="ic-msg-actions" role="toolbar" aria-label="Message actions">
            <button className="ic-msg-act" title="Copy" onClick={() => copyMessage(m.content)}>⧉ Copy</button>
            {mine && <button className="ic-msg-act" title="Edit" onClick={() => { setEditingId(m.id); setEditText(m.content); }}>✎ Edit</button>}
            {mine && (
              confirmDelete === m.id
                ? <>
                    <button className="ic-msg-act" title="Confirm delete" style={{ color: "var(--danger)" }} onClick={() => deleteMessage(m.id, !!isDm)}>Confirm</button>
                    <button className="ic-msg-act" title="Cancel" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </>
                : <button className="ic-msg-act" title="Delete" onClick={() => setConfirmDelete(m.id)}>🗑 Delete</button>
            )}
            <button className="ic-msg-act" title="Profile" onClick={() => openProfile(m.sender.id)}>👤</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ic-shell">
      <header className="ic-topbar">
        <div className="ic-mobilebar">
          <button className="ic-tool-btn" onClick={() => setSideOpen((v) => !v)} aria-label="Rooms">☰</button>
        </div>
        <div className="ic-brand"><span className="ic-brand-mark">◈</span> INFRA<span style={{ color: "var(--muted)", fontWeight: 600 }}>CHAT</span></div>
        <span className="ic-mono hide-m" style={{ fontSize: 11, color: "var(--faint)", letterSpacing: "0.08em" }}>INFRA//CHAT</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <button className="ic-tool-btn" onClick={() => setSearchOpen(true)} title="Search messages">⌕ <span className="ic-hide-mobile">Search</span></button>
          <button className="ic-tool-btn" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)">⌘K</button>
          <button className={`ic-tool-btn${membersOpen ? " on" : ""}`} onClick={() => setMembersOpen((v) => !v)} title="Toggle members" aria-pressed={membersOpen}>👥</button>
          <button className="ic-tool-btn" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (?)">?</button>
          {me.role >= 2 && <a className="ic-tool-btn" href="/audit">Audit</a>}
          {me.role >= 3 && <a className="ic-tool-btn" href="/admin">Admin</a>}
          <button className="ic-tool-btn" type="button" title="Sign out" onClick={() => signOut({ callbackUrl: "/login" })}>⏻</button>
        </div>
      </header>

      <div className={`ic-workspace${membersOpen ? "" : " noright"}`}>
        <aside className={`ic-sidebar${sideOpen ? " open" : ""}`} aria-label="Rooms and navigation">
          <div className="ic-side-scroll">
            <div className="ic-side-actions">
              <button className="ic-side-action" onClick={() => setPaletteOpen(true)}>⌘ Commands<kbd>Ctrl K</kbd></button>
              <button className="ic-side-action" onClick={() => setSearchOpen(true)}>⌕ Search</button>
            </div>

            <div className="ic-side-section">
              <div className="ic-side-head">Rooms</div>
              {publicRooms.map((r) => (
                <button key={r.id}
                  className={`ic-room-btn${selected?.kind === "room" && selected.id === r.id ? " active" : ""}${(unreadRooms[r.id] ?? 0) > 0 ? " unread" : ""}`}
                  onClick={() => { setSelected({ kind: "room", id: r.id }); setError(""); }}>
                  <span className="ic-hash">#</span>
                  <span className="ic-room-name">{r.name}</span>
                  {r.isArchived && <span className="ic-badge">archived</span>}
                  {r.roomType === "broadcast" && <span className="ic-badge accent">live</span>}
                  {(unreadRooms[r.id] ?? 0) > 0 && <span className="ic-unread">{unreadRooms[r.id]}</span>}
                </button>
              ))}
              {publicRooms.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", padding: "0 8px" }}>No rooms yet.</div>}
            </div>

            {privateRooms.length > 0 && (
              <div className="ic-side-section">
                <div className="ic-side-head">Private</div>
                {privateRooms.map((r) => (
                  <button key={r.id}
                    className={`ic-room-btn${selected?.kind === "room" && selected.id === r.id ? " active" : ""}${(unreadRooms[r.id] ?? 0) > 0 ? " unread" : ""}`}
                    onClick={() => { setSelected({ kind: "room", id: r.id }); setError(""); }}>
                      <span className="ic-hash">🔒</span>
                    <span className="ic-room-name">{r.name}</span>
                    {(unreadRooms[r.id] ?? 0) > 0 && <span className="ic-unread">{unreadRooms[r.id]}</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="ic-side-section">
              <div className="ic-side-head">Direct · {onlineUsers.length} online</div>
              {users.filter((u) => u.id !== me.id).map((u) => {
                const online = onlineIds.includes(u.id);
                return (
                  <button key={u.id}
                    className={`ic-room-btn${selected?.kind === "dm" && selected.id === u.id ? " active" : ""}`}
                    onClick={() => { setSelected({ kind: "dm", id: u.id }); setError(""); }}>
                    <span className={`ic-presence-dot${online ? " online" : " offline"}`} style={{ border: "none" }} />
                    <span className="ic-room-name">{u.username}</span>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>{roleName(u.role)}</span>
                  </button>
                );
              })}
            </div>

            {me.role >= 2 && (
              <div className="ic-side-section">
                {!showCreate
                  ? <button className="ic-side-action" style={{ width: "100%" }} onClick={() => setShowCreate(true)}>＋ New room</button>
                  : <form onSubmit={createRoom} style={{ padding: "0 2px", display: "grid", gap: 6 }}>
                      <input className="ic-input" placeholder="room-name" value={roomForm.name}
                        onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} required autoFocus />
                      <input className="ic-input" placeholder="Description (optional)" value={roomForm.description}
                        onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })} />
                      <select className="ic-select" value={roomForm.roomType}
                        onChange={(e) => setRoomForm({ ...roomForm, roomType: e.target.value })}>
                        <option value="public">public</option>
                        <option value="private">private</option>
                        {me.role >= 3 && <option value="broadcast">broadcast (admin)</option>}
                      </select>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="ic-btn sm primary" type="submit">Create</button>
                        <button className="ic-btn sm ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                      </div>
                    </form>}
              </div>
            )}
          </div>

          <div className="ic-me">
            <span className="ic-avatar sm" style={{ background: avatarColor(me.username) }}>{initials(me.username)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{me.username}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                <span style={{ color: "var(--success)" }}>●</span> {roleName(me.role)}
                {totalUnread > 0 && <span style={{ color: "var(--accent)" }}> · {totalUnread} unread</span>}
              </div>
            </div>
          </div>
        </aside>

        <main className="ic-chat" aria-label="Messages">
          {!selected ? (
            <div className="ic-empty">
              <h3>No room selected</h3>
              <p>Pick a room from the sidebar, or press <code>Ctrl+K</code> to jump.</p>
              {error && <p className="ic-error" style={{ marginTop: 12 }}>{error}</p>}
            </div>
          ) : (
            <>
              <div className="ic-roombar">
                <div style={{ minWidth: 0 }}>
                  <div className="ic-roombar-title">
                    {isDm ? `@ ${selectedDmUser?.username}` : <><span className="ic-hash">#</span> {selectedRoom?.name}</>}
                    {selectedRoom?.isArchived && <span className="ic-badge warn">archived</span>}
                    {selectedRoom?.roomType === "broadcast" && <span className="ic-badge accent">broadcast</span>}
                    {selectedRoom?.isPrivate && <span className="ic-badge">private</span>}
                  </div>
                  {selectedRoom?.description && <div className="ic-roombar-sub">{selectedRoom.description}</div>}
                  {!isDm && selectedRoom && <div className="ic-roombar-sub"><span className="ic-mono" style={{ color: "var(--faint)" }} title={selectedRoom.id}>{selectedRoom.id.slice(0, 8)}</span> · {members.length} members · {members.filter((m) => onlineIds.includes(m.user.id)).length} online</div>}
                </div>
                <div className="ic-roombar-tools">
                  {selected?.kind === "room" && (
                    <>
                      <button className="ic-tool-btn" onClick={() => joinLeave(true)} title="Join room">Join</button>
                      <button className="ic-tool-btn" onClick={() => joinLeave(false)} title="Leave room">Leave</button>
                      {me.role >= 3 && (
                        <>
                          <button className="ic-tool-btn" onClick={toggleArchive} title="Archive toggle">
                            {selectedRoom?.isArchived ? "Unarchive" : "Archive"}
                          </button>
                          <button className="ic-tool-btn" style={{ color: "var(--danger)" }} onClick={deleteRoom} title="Delete room">Delete</button>
                        </>
                      )}
                    </>
                  )}
                  <button className={`ic-tool-btn${membersOpen ? " on" : ""}`} onClick={() => setMembersOpen((v) => !v)}>👥</button>
                </div>
              </div>

              {(selectedRoom?.announcementText || (!selectedRoom?.announcementText && notice)) && !isDm && (
                <div className="ic-announce" role="note">📢 <span>{selectedRoom?.announcementText ?? notice}</span></div>
              )}
              {error && <div style={{ margin: "10px 16px 0" }}><div className="ic-error">{error}</div></div>}

              <div className="ic-msgs" aria-live="polite">
                {hasMore && (
                  <div style={{ textAlign: "center", padding: "8px 0" }}>
                    <button className="ic-btn sm" onClick={loadOlder} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : "Load older messages"}
                    </button>
                  </div>
                )}
                {loadingMsgs ? (
                  <div style={{ padding: "8px 16px", display: "grid", gap: 14 }}>
                    {[0, 1, 2, 3, 4].map((k) => (
                      <div key={k} style={{ display: "flex", gap: 10 }}>
                        <div className="ic-skel" style={{ width: 34, height: 34, borderRadius: "50%" }} />
                        <div style={{ flex: 1, display: "grid", gap: 6 }}>
                          <div className="ic-skel" style={{ height: 12, width: "30%" }} />
                          <div className="ic-skel" style={{ height: 12, width: `${70 - k * 8}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="ic-empty">
                    <h3>No messages yet</h3>
                    <p>{isDm ? `Start the conversation with @${selectedDmUser?.username}.` : `Start the conversation in #${selectedRoom?.name}. Try /help to see commands.`}</p>
                  </div>
                ) : (
                  (() => {
                    let lastDay = "";
                    const out: React.ReactNode[] = [];
                    messages.forEach((m, i) => {
                      const day = dayLabel(m.createdAt);
                      if (day !== lastDay) {
                        lastDay = day;
                        out.push(<div key={`day-${day}-${m.id}`} className="ic-day-sep">{day}</div>);
                      }
                      out.push(renderMessage(m, i));
                    });
                    return out;
                  })()
                )}
                <div ref={bottomRef} />
              </div>
              <div className="ic-typing" aria-live="polite">
                {typingUsers.length > 0 && <><span className="ic-typing-dots"><i /><i /><i /></span><span><strong>{typingUsers.join(", ")}</strong> typing…</span></>}
              </div>

              {showSlash && (
                <SlashList matches={slashMatches} sel={slashIdx} users={users}
                  text={text}
                  onPick={(cmd) => applySlash(cmd)} onMember={(u) => {
                    const withoutTarget = text.replace(/@\S*$/, "");
                    setText(withoutTarget + "@" + u);
                    composerRef.current?.focus();
                  }} />
              )}

              <div className="ic-composer-wrap">
                <div className="ic-composer">
                  {pendingFiles.length > 0 && (
                    <div className="ic-pending">
                      {pendingFiles.map((f, i) => (
                        <span key={i} className="ic-pending-file">
                          📎 {f.name}
                          <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="ic-composer-row">
                    <textarea
                      ref={composerRef}
                      className="ic-composer-input"
                      rows={1}
                      placeholder={isDm ? `Message @${selectedDmUser?.username}…` : `Message #${selectedRoom?.name}…  ( / for commands )`}
                      value={text}
                      onChange={(e) => onTextChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (showSlash && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                          e.preventDefault();
                          setSlashIdx((s) => (e.key === "ArrowDown" ? (s + 1) % slashMatches.length : (s - 1 + slashMatches.length) % slashMatches.length));
                        } else if (showSlash && e.key === "Tab") {
                          e.preventDefault();
                          applySlash(slashMatches[slashIdx].name);
                        } else if (e.key === "Enter" && !e.shiftKey) {
                          if (showSlash) {
                            e.preventDefault();
                            applySlash(slashMatches[slashIdx].name);
                          } else {
                            e.preventDefault();
                            send();
                          }
                        } else if (e.key === "Escape") {
                          setSlashIdx(0);
                        }
                      }}
                      disabled={!!selectedRoom && !canSendRoom}
                      aria-label="Message input"
                    />
                    <button className="ic-slash-key" title="Insert a command" onClick={() => { setText((t) => (t.startsWith("/") ? t : "/" + t)); composerRef.current?.focus(); }}>/</button>
                    <label className="ic-icon-btn" title="Attach files (max 10MB)">
                      📎<span className="sr-only">Attach</span>
                      <input type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
                    </label>
                    <button className="ic-send-btn" onClick={() => send()} disabled={uploading || (!!selectedRoom && !canSendRoom) || (!text.trim() && pendingFiles.length === 0)}>
                      {uploading ? "…" : "Send"}
                    </button>
                  </div>
                  <div className="ic-composer-hint">
                    <span><b>/</b> commands</span><span><b>enter</b> send</span><span><b>shift+enter</b> newline</span><span><b>ctrl+k</b> palette</span>
                  </div>
                </div>
                {selectedRoom && !canSendRoom && <div className="ic-error" style={{ marginTop: 8 }}>Read-only — this room is archived or broadcast-limited.</div>}
              </div>
            </>
          )}
        </main>

        {membersOpen && selected?.kind === "room" && selectedRoom && (
          <aside className="ic-context open" aria-label="Members">
            <div className="ic-ctx-scroll">
              <div className="ic-label" style={{ marginBottom: 8 }}>Members · {members.length}</div>
              {groupedMembers.mods.length > 0 && (
                <>
                  <div className="ic-label" style={{ margin: "10px 0 4px", fontSize: 10 }}>Moderators</div>
                  {groupedMembers.mods.map((m) => (
                    <MemberRow key={m.user.id} user={m.user} online={onlineIds.includes(m.user.id)} me={me}
                      onOpen={(u) => setPopUser({ id: u.id, username: u.username, role: u.role, online: onlineIds.includes(u.id) })} />
                  ))}
                </>
              )}
              <div className="ic-label" style={{ margin: "10px 0 4px", fontSize: 10 }}>Members</div>
              {groupedMembers.rest.map((m) => (
                <MemberRow key={m.user.id} user={m.user} online={onlineIds.includes(m.user.id)} me={me}
                  onOpen={(u) => setPopUser({ id: u.id, username: u.username, role: u.role, online: onlineIds.includes(u.id) })} />
              ))}
              {members.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>No members loaded.</div>}

              {me.role >= 2 && (
                <form onSubmit={addMember} style={{ marginTop: 16, display: "grid", gap: 6 }}>
                  <div className="ic-label">Add member</div>
                  <select className="ic-select" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
                    <option value="">— select user —</option>
                    {users.filter((u) => !members.some((m) => m.user.id === u.id)).map((u) => (
                      <option key={u.id} value={u.id}>@{u.username}</option>
                    ))}
                  </select>
                  <button className="ic-btn sm" type="submit" disabled={!addUserId}>Add to room</button>
                </form>
              )}
              <div style={{ marginTop: 16 }}>
                <div className="ic-label" style={{ marginBottom: 6 }}>Moderation</div>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                  Press <span className="ic-mono" style={{ color: "var(--accent)" }}>/</span> in the composer for kick, mute, ban, announce. Permission-aware.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {paletteOpen && (
        <CommandPalette me={me} rooms={rooms} users={users}
          onClose={() => setPaletteOpen(false)}
          onSelectRoom={(id) => { setSelected({ kind: "room", id }); setPaletteOpen(false); }}
          onSelectDm={(id) => { setSelected({ kind: "dm", id }); setPaletteOpen(false); }}
          onRun={(cmd) => { setPaletteOpen(false); setText(cmd + " "); composerRef.current?.focus(); }} />
      )}
      {searchOpen && (
        <SearchDialog rooms={rooms} onClose={() => setSearchOpen(false)}
          onJump={(roomId, msgId) => {
            setSelected({ kind: "room", id: roomId });
            setSearchOpen(false);
            setTimeout(() => {
              document.getElementById(`msg-${msgId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 600);
          }} />
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {popUser && (
        <UserPopover user={popUser} me={me}
          onClose={() => setPopUser(null)}
          onMessage={() => { setSelected({ kind: "dm", id: popUser.id }); setPopUser(null); }}
          onMod={(cmd, extra) => quickMod(cmd, popUser.username, extra)}
          onKick={() => { kickMember(popUser.id); setPopUser(null); }} />
      )}

      <footer className={`ic-statusbar${connState === "reconnecting" ? " recon" : ""}`} aria-label="Connection and session status">
        <span className="st"><i className="dot" />{connState === "connected" ? "connected" : "reconnecting"}</span>
        {selectedRoom && !isDm && <span className="st">#{selectedRoom.name}</span>}
        {isDm && selectedDmUser && <span className="st">@{selectedDmUser.username}</span>}
        <span className="st hide-m">{roleName(me.role)}</span>
        {!isDm && <span className="st hide-m">{members.filter((m) => onlineIds.includes(m.user.id)).length}/{members.length} online</span>}
        {totalUnread > 0 && <span className="st">{totalUnread} unread</span>}
        <span className="st hide-m">ctrl+k palette · / commands · ? shortcuts</span>
      </footer>

      <div className="ic-toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="ic-toast">{t.text}</div>)}
      </div>
    </div>
  );
}

/* ================= sub components ================= */

function MemberRow({ user, online, me, onOpen }: { user: ChatUser; online: boolean; me: ChatUser; onOpen: (u: ChatUser) => void }) {
  return (
    <button className="ic-member-row" onClick={() => onOpen(user)}>
      <span className={`ic-presence-dot${online ? " online" : " offline"}`} style={{ border: "none" }} />
      <span className="ic-avatar sm" style={{ background: avatarColor(user.username), width: 24, height: 24, fontSize: 9 }}>{initials(user.username)}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{user.username}{user.id === me.id && " (you)"}</span>
      <span style={{ fontSize: 10, color: "var(--muted)" }}>{roleName(user.role)}</span>
      <span className="ic-see-profile">profile →</span>
    </button>
  );
}

function linkify(content: string): React.ReactNode {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRe);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : <span key={i}>{p}</span>
  );
}

function SlashList({ matches, sel, users, text, onPick, onMember }: {
  matches: { name: string; description: string; usage: string; category: string; minRole: number }[];
  sel: number; users: ChatUser[]; text: string;
  onPick: (cmd: string) => void; onMember: (username: string) => void;
}) {
  const atMatch = text.match(/\/\w+\s+@(\w*)$/);
  const memberQ = atMatch ? atMatch[1].toLowerCase() : null;
  if (memberQ !== null) {
    const mu = users.filter((u) => u.username.toLowerCase().startsWith(memberQ)).slice(0, 6);
    if (mu.length === 0) return null;
    return (
      <div className="ic-slash" role="listbox" aria-label="Member suggestions">
        <div className="ic-slash-cat">Members</div>
        {mu.map((u) => (
          <button key={u.id} className="ic-slash-item" onClick={() => onMember(u.username)}>
            <span className="ic-avatar sm" style={{ background: avatarColor(u.username) }}>{initials(u.username)}</span>
            <span className="ic-slash-cmd">@{u.username}</span>
            <span className="ic-slash-desc">{roleName(u.role)}</span>
          </button>
        ))}
      </div>
    );
  }
  let lastCat = "";
  return (
    <div className="ic-slash" role="listbox" aria-label="Command suggestions">
      {matches.map((c, i) => {
        const head = c.category !== lastCat;
        if (head) lastCat = c.category;
        return (
          <div key={c.name}>
            {head && <div className="ic-slash-cat">{c.category}</div>}
            <button className={`ic-slash-item${i === sel ? " sel" : ""}`} onClick={() => onPick(c.name)}
              role="option" aria-selected={i === sel}>
              <span className="ic-slash-cmd">{c.name}</span>
              <span className="ic-slash-desc">{c.description} · <span className="ic-mono" style={{ fontSize: 11 }}>{c.usage}</span></span>
              {c.minRole >= 3 && <span className="ic-slash-perm">admin</span>}
              {c.minRole === 2 && <span className="ic-slash-perm">mod</span>}
            </button>
          </div>
        );
      })}
      <div style={{ padding: "4px 12px 8px", fontSize: 11, color: "var(--muted)" }}>{matches.length} match{matches.length === 1 ? "" : "es"} · Tab to complete</div>
    </div>
  );
}

function CommandPalette({ me, rooms, users, onClose, onSelectRoom, onSelectDm, onRun }: {
  me: ChatUser;
  rooms: Room[]; users: ChatUser[];
  onClose: () => void;
  onSelectRoom: (id: string) => void;
  onSelectDm: (id: string) => void;
  onRun: (cmd: string) => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo(() => {
    const ql = q.toLowerCase().replace(/^\//, "");
    const out: { key: string; cat: string; icon: string; label: string; sub: string; hint?: string[]; fn: () => void }[] = [];
    rooms.filter((r) => r.name.toLowerCase().includes(ql)).slice(0, 5).forEach((r) =>
      out.push({ key: "room-" + r.id, cat: "Navigation", icon: "#", label: `Switch to #${r.name}`, sub: r.description || r.roomType, fn: () => onSelectRoom(r.id) }));
    users.filter((u) => u.id !== me.id && u.username.toLowerCase().includes(ql)).slice(0, 4).forEach((u) =>
      out.push({ key: "dm-" + u.id, cat: "Communication", icon: "@", label: `Message @${u.username}`, sub: roleName(u.role), fn: () => onSelectDm(u.id) }));
    COMMANDS.filter((c) => me.role >= c.minRole && (c.name.includes(ql) || c.description.toLowerCase().includes(ql))).forEach((c) =>
      out.push({ key: "cmd-" + c.name, cat: c.category === "General" ? "Commands" : c.category, icon: "/", label: `${c.name} — ${c.description}`, sub: c.usage, hint: c.minRole >= 3 ? ["admin"] : c.minRole === 2 ? ["mod"] : undefined, fn: () => onRun(c.name) }));
    if (me.role >= 2) out.push({ key: "nav-audit", cat: "Administration", icon: "◔", label: "Open audit log", sub: "Moderation history", fn: () => { window.location.href = "/audit"; } });
    if (me.role >= 3) out.push({ key: "nav-admin", cat: "Administration", icon: "⚙", label: "Open admin", sub: "Members & roles", fn: () => { window.location.href = "/admin"; } });
    return ql ? out.filter((i) => (i.label + i.sub).toLowerCase().includes(ql)) : out;
  }, [q, rooms, users, me, onSelectRoom, onSelectDm, onRun]);

  useEffect(() => { setIdx(0); }, [q]);

  let last = "";
  return (
    <div className="ic-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="ic-palette" onClick={(e) => e.stopPropagation()}>
        <div className="ic-palette-input">
          <span className="pfx">⌘</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search commands, rooms, people…"
            aria-label="Search commands"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % Math.max(items.length, 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + items.length) % Math.max(items.length, 1)); }
              if (e.key === "Enter" && items[idx]) { e.preventDefault(); items[idx].fn(); }
            }} />
          <kbd className="ic-kbd">esc</kbd>
        </div>
        <div className="ic-palette-body">
        <div className="ic-palette-list" role="listbox">
          {items.length === 0 && <div className="ic-empty" style={{ padding: 28 }}><h3>No matches</h3><p>Try another search.</p></div>}
          {items.map((it, i) => {
            const head = it.cat !== last;
            if (head) last = it.cat;
            return (
              <div key={it.key}>
                {head && <div className="ic-slash-cat">{it.cat}</div>}
                <button className={`ic-pal-item${i === idx ? " sel" : ""}`} role="option" aria-selected={i === idx}
                  onMouseEnter={() => setIdx(i)} onClick={it.fn}>
                  <span className="ic-pal-icon">{it.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
                    <span className="ic-mono" style={{ fontSize: 11, color: "var(--muted)" }}>{it.sub}</span>
                  </span>
                  {it.hint && <span className="ic-pal-short">{it.hint.map((h) => <kbd key={h}>{h}</kbd>)}</span>}
                </button>
              </div>
            );
          })}
        </div>
          <aside className="ic-pal-detail" aria-label="Selection details">
            {items[idx] ? (
              <>
                <div className="ic-label">Detail</div>
                <h4>{items[idx].label}</h4>
                <div className="usage">{items[idx].sub}</div>
                <p>
                  {items[idx].key.startsWith("cmd-")
                    ? items[idx].hint?.includes("admin")
                      ? "Requires SuperAdmin. Permission is re-checked by the server on execution."
                      : items[idx].hint?.includes("mod")
                        ? "Requires Moderator or higher. Permission is re-checked by the server on execution."
                        : "Available to every member. Runs in the current room."
                    : items[idx].key.startsWith("room-")
                      ? "Jump to this room. Unread state and history carry over."
                      : items[idx].key.startsWith("dm-")
                        ? "Open a direct thread with this user."
                        : "Open this workspace area."}
                </p>
                {items[idx].hint && <div>{items[idx].hint.map((h) => <span key={h} className="ic-badge warn" style={{ marginRight: 4 }}>{h}</span>)}</div>}
              </>
            ) : (
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Nothing selected.</p>
            )}
          </aside>
        </div>
        <div className="ic-pal-foot">
          <span className="hint"><span className="ic-kbd">↵</span> run</span>
          <span className="hint"><span className="ic-kbd">↑↓</span> navigate</span>
          <span className="hint"><span className="ic-kbd">esc</span> close</span>
          <span className="hint" style={{ marginLeft: "auto" }}>{items.length} results</span>
        </div>
      </div>
    </div>
  );
}

function SearchDialog({ rooms, onClose, onJump }: {
  rooms: Room[];
  onClose: () => void;
  onJump: (roomId: string, msgId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ roomId: string; roomName: string; message: Message }[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function run(query: string) {
    if (query.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    try {
      const all: { roomId: string; roomName: string; message: Message }[] = [];
      for (const r of rooms.slice(0, 12)) {
        try {
          const res = await fetch(`/api/rooms/${r.id}/messages?limit=50&page=1`);
          if (!res.ok) continue;
          const data = await res.json();
          const ql = query.toLowerCase();
          (data.messages as Message[]).filter((m) => m.content.toLowerCase().includes(ql)).slice(0, 4).forEach((m) =>
            all.push({ roomId: r.id, roomName: r.name, message: m }));
          if (all.length >= 20) break;
        } catch { /* skip */ }
      }
      setResults(all.slice(0, 20));
    } finally {
      setBusy(false);
    }
  }

  function onChange(v: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(v), 220);
    setQ(v);
  }

  return (
    <div className="ic-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search messages">
      <div className="ic-palette" onClick={(e) => e.stopPropagation()}>
        <div className="ic-palette-input">
          <span style={{ color: "var(--muted)" }}>⌕</span>
          <input ref={inputRef} value={q} onChange={(e) => onChange(e.target.value)} placeholder="Search messages across rooms…" aria-label="Search messages" />
        </div>
        <div className="ic-palette-list">
          {busy && <div style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}>Searching…</div>}
          {!busy && q.trim().length >= 2 && results.length === 0 && (
            <div className="ic-empty" style={{ padding: 28 }}><h3>No messages found</h3><p>Try another search.</p></div>
          )}
          {!busy && q.trim().length < 2 && (
            <div style={{ padding: 12, fontSize: 12, color: "var(--muted)" }}>Type at least 2 characters. Searches recent history in your rooms.</div>
          )}
          {results.map((r) => (
            <button key={r.message.id} className="ic-pal-item" onClick={() => onJump(r.roomId, r.message.id)}>
              <span className="ic-pal-icon">#</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>#{r.roomName} · {r.message.sender.username} · {formatDateTime(r.message.createdAt)}</span>
                <span style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message.content.slice(0, 140)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Ctrl/⌘ + K", "Command palette"],
    ["/", "Slash commands in composer"],
    ["Tab", "Complete command"],
    ["↑ / ↓ + Enter", "Navigate & run"],
    ["Esc", "Close dialogs"],
    ["?", "This help"],
    ["Shift + Enter", "Newline in composer"],
  ];
  return (
    <div className="ic-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="ic-popover-card" style={{ width: "min(420px, calc(100vw - 32px))" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 18px 6px", fontWeight: 800 }}>Keyboard shortcuts</div>
        <div style={{ padding: "6px 18px 18px", display: "grid", gap: 8 }}>
          {rows.map(([k, d]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <kbd className="ic-mono" style={{ fontSize: 11, color: "var(--accent)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 8px", background: "var(--bg)", minWidth: 110, textAlign: "center" }}>{k}</kbd>
              <span style={{ color: "var(--text-dim)" }}>{d}</span>
            </div>
          ))}
          <button className="ic-btn sm" onClick={onClose} style={{ marginTop: 6 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function UserPopover({ user, me, onClose, onMessage, onMod, onKick }: {
  user: PopUser; me: ChatUser;
  onClose: () => void; onMessage: () => void;
  onMod: (cmd: string, extra?: string) => void; onKick: () => void;
}) {
  const canMod = me.role >= 2 && user.id !== me.id && user.role < me.role;
  const isAdmin = me.role >= 3;
  return (
    <div className="ic-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Profile of ${user.username}`}>
      <div className="ic-popover-card" onClick={(e) => e.stopPropagation()}>
        <div className="ic-pop-banner" />
        <div style={{ padding: "0 16px 16px", marginTop: -24 }}>
          <span className="ic-avatar" style={{ background: avatarColor(user.username), width: 48, height: 48, fontSize: 15, border: "3px solid var(--elevated)" }}>
            {initials(user.username)}
          </span>
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 8 }}>@{user.username}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
            <span className={`ic-presence-dot${user.online ? " online" : " offline"}`} style={{ border: "none" }} />
            {user.online ? "Online" : "Offline"} · {roleName(user.role)}
          </div>
          <div className="ic-label" style={{ margin: "14px 0 6px" }}>Roles</div>
          <div><span className="ic-badge accent">{roleName(user.role)}</span></div>
          <div style={{ display: "grid", gap: 2, marginTop: 12 }}>
            {user.id !== me.id && <button className="ic-pop-action" onClick={onMessage}>✉ Message</button>}
            {canMod && (
              <>
                <button className="ic-pop-action" onClick={() => onMod("/mute", "10")}>🔇 Mute 10 min</button>
                <button className="ic-pop-action" onClick={() => onMod("/unmute")}>🔊 Unmute</button>
                <button className="ic-pop-action danger" onClick={onKick}>🦵 Kick from room</button>
                <button className="ic-pop-action danger" onClick={() => onMod("/ban")}>⛔ Ban from room</button>
              </>
            )}
            {isAdmin && user.id !== me.id && user.role < me.role && (
              <>
                <button className="ic-pop-action" onClick={() => onMod("/promote")}>⬆ Promote role</button>
                <button className="ic-pop-action" onClick={() => onMod("/demote")}>⬇ Demote role</button>
              </>
            )}
            {!canMod && user.id !== me.id && (
              <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 12px" }}>No moderation actions available for this user.</div>
            )}
          </div>
          <button className="ic-btn sm ghost" onClick={onClose} style={{ marginTop: 10, width: "100%" }}>Close</button>
        </div>
      </div>
    </div>
  );
}
