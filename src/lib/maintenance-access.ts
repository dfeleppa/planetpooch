import type { Company } from "@prisma/client";

export type MaintenanceUser = { id?: string; role?: string | null; company?: string | null };
const COMPANIES: Company[] = ["RESORT", "GROOMING"];

// Saved assignments are the authority. View cookies, request headers, and CMO
// titles must never widen a business employee's maintenance permissions.
export function maintenanceCompanyWhere(user: MaintenanceUser, requested?: unknown) {
  // Shared front-desk accounts always operate in Resort, including when a
  // stale URL asks for another business. They never gain manager permissions.
  if (user.role === "FRONT_DESK") return { company: { in: ["RESORT" as Company] } };
  const allowed = user.company === "CORPORATE" || user.role === "SUPER_ADMIN" || user.role === "ADMIN"
    ? COMPANIES
    : COMPANIES.filter((company) => company === user.company);
  return { company: { in: requested == null ? allowed : allowed.filter((company) => company === requested) } };
}

export function canAccessMaintenanceCompany(user: MaintenanceUser, company: unknown): boolean {
  return maintenanceCompanyWhere(user, company).company.in.includes(company as Company);
}

export function canManageMaintenance(user: MaintenanceUser): boolean {
  return ["MANAGER", "SUPER_ADMIN", "ADMIN"].includes(user.role ?? "");
}

export function canUpdateMaintenanceTask(user: MaintenanceUser, task: { assignedToId: string | null }): boolean {
  return canManageMaintenance(user) || user.role === "FRONT_DESK" || task.assignedToId === null || task.assignedToId === user.id;
}
