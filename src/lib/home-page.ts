// Pet Resort managers and the shared front desk start with daily operations.
export function homePageFor(user: { id?: string | null; role?: string | null; company?: string | null } | null | undefined): string {
  return user?.role === "FRONT_DESK" || (user?.role === "MANAGER" && user.company === "RESORT")
    ? "/maintenance/checklists?company=RESORT"
    : "/dashboard";
}
