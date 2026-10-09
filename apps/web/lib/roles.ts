export const ROLES = {
  MEMBER: 1,
  MODERATOR: 2,
  SUPERADMIN: 3,
} as const;

export function roleName(role: number): string {
  if (role >= 3) return "SuperAdmin";
  if (role === 2) return "Moderator";
  return "Member";
}

export function canActOn(actorRole: number, targetRole: number): boolean {
  return actorRole > targetRole;
}

export function requireMinRole(role: number | undefined, min: number): boolean {
  return (role ?? 0) >= min;
}
