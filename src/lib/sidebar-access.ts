import { BUSINESSES, type BusinessCompany } from "./business";

type SidebarUser = { id?: string | null; company?: string | null } | null | undefined;

// Verified employee account IDs; names and job titles do not grant access.
const PET_RESORT_USERS = new Set([
  "cmoc059wd000rjr04x03j7h19", // Derek Wolpert
  "cmoc0283w000jjr04200pulk3", // Kimberly N Salvoni
]);
const STACEY_CONTI_USER_ID = "cmobz2cwb0007k0041qnobqcz";

export function canSeeCorporateSidebar(user: SidebarUser): boolean {
  return user?.company === "CORPORATE";
}

export function canSeeBusinessSidebar(user: SidebarUser, company: BusinessCompany): boolean {
  if (canSeeCorporateSidebar(user)) return true;
  if (!user?.id) return false;
  return company === "RESORT"
    ? user.company === "RESORT" && PET_RESORT_USERS.has(user.id)
    : user.company === "GROOMING" && user.id === STACEY_CONTI_USER_ID;
}

export function sidebarBusinesses(user: SidebarUser) {
  return BUSINESSES.filter(({ company }) => canSeeBusinessSidebar(user, company));
}
