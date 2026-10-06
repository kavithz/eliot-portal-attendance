import type { Role } from "@prisma/client";

export type Permission =
  | "employee:manage"
  | "employee:records:read"
  | "attendance:manage"
  | "attendance:department:read"
  | "attendance:assigned:read"
  | "attendance:monitor"
  | "attendance:missing-punch:review"
  | "attendance:correction:manage"
  | "attendance:correction:approve"
  | "attendance:correction:submit"
  | "leave:manage"
  | "leave:approve"
  | "leave:submit"
  | "leave:request:self:read"
  | "leave:balance:self:read"
  | "overtime:approve"
  | "shift:manage"
  | "reports:read"
  | "reports:department:read"
  | "payroll:export"
  | "roster:self:read"
  | "notifications:self:read";

const rolePermissions: Record<Exclude<Role, "ADMIN">, readonly Permission[]> = {
  EMPLOYEE: [
    "attendance:correction:submit",
    "leave:submit",
    "leave:request:self:read",
    "leave:balance:self:read",
    "roster:self:read",
    "notifications:self:read",
  ],
  HR_ADMINISTRATOR: [
    "employee:manage",
    "employee:records:read",
    "attendance:manage",
    "attendance:correction:manage",
    "leave:manage",
    "leave:approve",
    "shift:manage",
    "reports:read",
    "payroll:export",
  ],
  DEPARTMENT_MANAGER: [
    "attendance:department:read",
    "attendance:correction:approve",
    "leave:approve",
    "overtime:approve",
    "reports:department:read",
  ],
  SUPERVISOR: [
    "attendance:assigned:read",
    "attendance:monitor",
    "attendance:missing-punch:review",
    "attendance:correction:submit",
    "leave:approve",
  ],
};

// ADMIN remains the existing full-access Super Administrator role.
export function hasPermission(role: Role, permission: Permission) {
  if (role === "ADMIN") return true;
  return rolePermissions[role].includes(permission);
}
