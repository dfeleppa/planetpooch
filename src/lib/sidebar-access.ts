import { BUSINESSES, type BusinessCompany } from "./business";

type SidebarUser = { id?: string | null; company?: string | null; role?: string | null } | null | undefined;

// Stacey retains her separate Mobile Grooming inventory access.
const STACEY_CONTI_USER_ID = "cmobz2cwb0007k0041qnobqcz";

export function canSeeCorporateSidebar(user: SidebarUser): boolean {
  if (user?.role === "FRONT_DESK") return false;
  return user?.company === "CORPORATE";
}

export function canSeeBusinessSidebar(user: SidebarUser, company: BusinessCompany): boolean {
  if (user?.role === "FRONT_DESK") return company === "RESORT";
  if (canSeeCorporateSidebar(user)) return true;
  if (user?.role === "MANAGER") return user.company === company;
  return company === "GROOMING" && user?.company === "GROOMING" && user.id === STACEY_CONTI_USER_ID;
}

export function sidebarBusinesses(user: SidebarUser) {
  return BUSINESSES.filter(({ company }) => canSeeBusinessSidebar(user, company));
}
