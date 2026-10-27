/** Ask Pooch is currently available only to employees assigned to Corporate. */
export function hasAskPoochAccess(user: { company?: string | null } | null | undefined): boolean {
  return user?.company === "CORPORATE";
}
