// Stacey manages Mobile Grooming counts and required quantities without manager access
// to employee records or item setup.
const STACEY_CONTI_USER_ID = "cmobz2cwb0007k0041qnobqcz";

export function canEditGroomingCounts(user: {
  id?: string | null;
  role?: string | null;
  company?: string | null;
} | null | undefined): boolean {
  return user?.role === "MANAGER" || user?.role === "SUPER_ADMIN" ||
    (user?.id === STACEY_CONTI_USER_ID && user.company === "GROOMING");
}

// Non-managers can update only the required quantity of Mobile Grooming items.
export function canEditGroomingRequirements(
  user: Parameters<typeof canEditGroomingCounts>[0],
  company: string,
  body: Record<string, unknown>,
): boolean {
  return canEditGroomingCounts(user) && company === "GROOMING" &&
    Object.keys(body).length === 1 && Object.prototype.hasOwnProperty.call(body, "minimumThreshold");
}
