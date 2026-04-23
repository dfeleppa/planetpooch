/**
 * Onboarding helpers. More helpers (snapshotTemplate, recomputeOnboardingStatus)
 * will be added in later phases. For Phase 1 we only need the temp-password
 * generator for the admin "+ Add Employee" flow.
 */

/**
 * Generates a human-readable temporary password. Format: AAAA-1234-bbbb
 * (easy to read aloud, ~10^12 entropy). Admin shows this once, employee must
 * change on first login.
 */
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
  const lower = "abcdefghijkmnpqrstuvwxyz"; // no l, o
  const digits = "23456789"; // no 0, 1

  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () =>
      set[Math.floor(Math.random() * set.length)]
    ).join("");

  return `${pick(upper, 4)}-${pick(digits, 4)}-${pick(lower, 4)}`;
}
