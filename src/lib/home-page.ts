// Derek Wolpert and Kimberly Salvoni use the Pet Resort operations dashboard.
// Stable account IDs keep this preference independent of names and sign-in email.
const RESORT_DASHBOARD_USERS = new Set([
  "cmoc059wd000rjr04x03j7h19",
  "cmoc0283w000jjr04200pulk3",
]);

export function homePageFor(user: { id?: string | null; role?: string | null } | null | undefined): string {
  return user?.role === "FRONT_DESK" || user?.id && RESORT_DASHBOARD_USERS.has(user.id)
    ? "/maintenance/checklists?company=RESORT"
    : "/dashboard";
}
