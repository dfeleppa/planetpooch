import type { MaintenanceUser } from "./maintenance-access";
import { canAccessMaintenanceCompany } from "./maintenance-access";

export const CHECKLIST_DEPARTMENTS = ["BOARDING", "GROOMING", "FRONT_DESK", "MANAGEMENT"] as const;
type ChecklistUser = MaintenanceUser & { email?: string | null };
const MANAGEMENT_STAFF_IDS = new Set([
  "cmoc0283w000jjr04200pulk3", // Kimberly N Salvoni
  "cmoc059wd000rjr04x03j7h19", // Derek Wolpert
]);
export type ChecklistDepartment = (typeof CHECKLIST_DEPARTMENTS)[number];
// Explicit account assignments, verified against the active employee directory.
const GROOMING_STAFF_IDS = new Set([
  "cmobz2cwb0007k0041qnobqcz", // Stacey Conti
  "cmoc04aqt000njr04ehczgndc", // Gabriela Sanchez
  "cmtxaffs40001l2042xiq3yrs", // Andrea Wagner
]);
export function isGroomingChecklistStaff(user: ChecklistUser | null | undefined): boolean {
  return !!user?.id && GROOMING_STAFF_IDS.has(user.id);
}
export function checklistDepartments(user: ChecklistUser): readonly ChecklistDepartment[] {
  if (user.role === "FRONT_DESK" || user.email?.trim().toLowerCase() === "planetpoochpetservices@gmail.com") return ["FRONT_DESK"];
  if (user.company === "CORPORATE" || user.role === "SUPER_ADMIN") return CHECKLIST_DEPARTMENTS;
  if (user.id === "cmoc059wd000rjr04x03j7h19") return CHECKLIST_DEPARTMENTS;
  if (user.id && MANAGEMENT_STAFF_IDS.has(user.id)) return ["BOARDING", "FRONT_DESK", "MANAGEMENT"];
  if (isGroomingChecklistStaff(user)) return ["GROOMING"];
  return canAccessMaintenanceCompany(user, "RESORT") ? ["BOARDING", "GROOMING", "FRONT_DESK"] : [];
}
export function canAccessChecklist(user: ChecklistUser, department: unknown): boolean {
  return checklistDepartments(user).some((value) => value === department);
}
export function canEditChecklists(user: ChecklistUser): boolean {
  if (user.role === "FRONT_DESK" || user.email?.trim().toLowerCase() === "planetpoochpetservices@gmail.com") return false;
  return user.company === "CORPORATE" || user.id === "cmobz2cwb0007k0041qnobqcz";
}
