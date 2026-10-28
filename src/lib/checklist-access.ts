import type { MaintenanceUser } from "./maintenance-access";
import { canAccessMaintenanceCompany } from "./maintenance-access";

export const CHECKLIST_DEPARTMENTS = ["BOARDING", "GROOMING", "FRONT_DESK"] as const;
export type ChecklistDepartment = (typeof CHECKLIST_DEPARTMENTS)[number];
// Explicit account assignments, verified against the active employee directory.
const GROOMING_STAFF_IDS = new Set([
  "cmobz2cwb0007k0041qnobqcz", // Stacey Conti
  "cmoc04aqt000njr04ehczgndc", // Gabriela Sanchez
  "cmtxaffs40001l2042xiq3yrs", // Andrea Wagner
]);
export function isGroomingChecklistStaff(user: MaintenanceUser | null | undefined): boolean {
  return !!user?.id && GROOMING_STAFF_IDS.has(user.id);
}
export function checklistDepartments(user: MaintenanceUser): readonly ChecklistDepartment[] {
  if (user.company === "CORPORATE" || user.role === "SUPER_ADMIN") return CHECKLIST_DEPARTMENTS;
  if (isGroomingChecklistStaff(user)) return ["GROOMING"];
  return canAccessMaintenanceCompany(user, "RESORT") ? CHECKLIST_DEPARTMENTS : [];
}
export function canAccessChecklist(user: MaintenanceUser, department: unknown): boolean {
  return checklistDepartments(user).some((value) => value === department);
}
export function canEditChecklists(user: MaintenanceUser): boolean {
  if (user.company === "CORPORATE" || user.role === "SUPER_ADMIN") return true;
  if (isGroomingChecklistStaff(user)) return false;
  return canAccessMaintenanceCompany(user, "RESORT") && user.role === "MANAGER";
}
