import { cache } from "react";
import { cookies, headers } from "next/headers";
import { requireAuth } from "@/lib/auth-helpers";
import { businessCookieName, businessFor, employeeBusinessWhere, resolveBusiness, sidebarBusiness } from "@/lib/business";

export const getActiveBusiness = cache(async () => {
  const session = await requireAuth();
  const stored = (await cookies()).get(businessCookieName(session.user.id))?.value;
  // Company sidebar links select their company even when a preference exists.
  const requestUrl = (await headers()).get("x-portal-url");
  const url = requestUrl ? new URL(requestUrl) : null;
  const legacy = url && (businessFor(url.searchParams.get("company"))
    ?? businessFor(url.searchParams.get("business"))
    ?? businessFor(url.searchParams.get("segment"))
    ?? (url.pathname.startsWith("/finance/payroll/mobile-grooming") ? businessFor("GROOMING") : undefined));
  return resolveBusiness(session.user, (url && sidebarBusiness(url)?.company) || stored || legacy?.company);
});

export async function getEmployeeBusinessWhere() {
  const [session, business] = await Promise.all([requireAuth(), getActiveBusiness()]);
  return employeeBusinessWhere(session.user, business.company);
}
