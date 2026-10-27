// Stacey manages Mobile Grooming stock counts without receiving manager access
// to employee records, item setup, or required-quantity settings.
const STACEY_CONTI_USER_ID = "cmobz2cwb0007k0041qnobqcz";

export function canEditGroomingCounts(user: {
  id?: string | null;
  role?: string | null;
  company?: string | null;
} | null | undefined): boolean {
  return user?.role === "MANAGER" || user?.role === "SUPER_ADMIN" ||
    (user?.id === STACEY_CONTI_USER_ID && user.company === "GROOMING");
}
