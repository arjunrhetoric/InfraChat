// Frontend command catalog — mirrors lib/commands.ts KNOWN commands.
// Permission metadata only affects UX visibility; the backend stays authoritative.

export type CommandDef = {
  name: string;
  description: string;
  usage: string;
  category: "General" | "Moderation" | "Administration";
  minRole: number; // 1 member, 2 moderator, 3 superadmin
  needsTarget?: boolean;
};

export const COMMANDS: CommandDef[] = [
  { name: "/help", description: "Show available commands", usage: "/help", category: "General", minRole: 1 },
  { name: "/members", description: "List room members", usage: "/members", category: "General", minRole: 1 },
  { name: "/rooms", description: "List available rooms", usage: "/rooms", category: "General", minRole: 1 },
  { name: "/kick", description: "Remove a member from this room", usage: "/kick <username>", category: "Moderation", minRole: 2, needsTarget: true },
  { name: "/mute", description: "Mute a member, optionally for N minutes", usage: "/mute <username> [minutes]", category: "Moderation", minRole: 2, needsTarget: true },
  { name: "/unmute", description: "Restore a muted member", usage: "/unmute <username>", category: "Moderation", minRole: 2, needsTarget: true },
  { name: "/ban", description: "Ban a member from this room", usage: "/ban <username>", category: "Moderation", minRole: 2, needsTarget: true },
  { name: "/unban", description: "Lift a room ban", usage: "/unban <username>", category: "Moderation", minRole: 2, needsTarget: true },
  { name: "/announce", description: "Pin an announcement to this room", usage: "/announce <message>", category: "Moderation", minRole: 2 },
  { name: "/promote", description: "Raise a user's role one step", usage: "/promote <username>", category: "Administration", minRole: 3, needsTarget: true },
  { name: "/demote", description: "Lower a user's role one step", usage: "/demote <username>", category: "Administration", minRole: 3, needsTarget: true },
  { name: "/audit", description: "Show the 10 most recent audit events", usage: "/audit", category: "Administration", minRole: 3 },
];

export function roleName(role: number): string {
  if (role >= 3) return "SuperAdmin";
  if (role === 2) return "Moderator";
  return "Member";
}

export function avatarColor(username: string): string {
  const hues = [190, 210, 250, 160, 265, 330, 20, 140];
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) % 997;
  const hue = hues[h % hues.length];
  return `linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${(hue + 40) % 360} 65% 55%))`;
}

export function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
