export type AccountRole = "AUDITOR" | "ADMIN" | "OWNER";
export interface AdminUser {
  id: string; username: string; displayName: string; email: string; role: AccountRole;
  disabled: boolean; emailVerified: boolean; createdAt: string; revision: number;
}
export interface AdminPage<T> { items: T[]; hasMore: boolean }
export interface AdminEvent {
  id: number; actorId: string | null; targetId: string; action: "OWNER_BOOTSTRAPPED" | "ROLE_CHANGED" | "SUSPENDED" | "RESTORED";
  previousRole: AccountRole; nextRole: AccountRole; previousDisabled: boolean; nextDisabled: boolean;
  reason: string; createdAt: string;
}
export type AdminChange = { revision: number; reason: string; currentPassword: string }
  & ({ role: "AUDITOR" | "ADMIN"; disabled?: never } | { disabled: boolean; role?: never });

export function canManage(actorId: string, role: AccountRole, target: AdminUser) {
  return actorId !== target.id && target.role !== "OWNER"
    && (role === "OWNER" || (role === "ADMIN" && target.role === "AUDITOR"));
}
export function canChangeRole(actorId: string, role: AccountRole, target: AdminUser) {
  return canManage(actorId, role, target) && role === "OWNER" && (!target.disabled || target.role === "ADMIN");
}
export const ROLE_LABELS: Record<AccountRole, string> = { AUDITOR: "Auditor", ADMIN: "Admin", OWNER: "Owner" };
