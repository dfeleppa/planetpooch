import { cache } from "react";
import { cookies, headers } from "next/headers";
import { requireAuth } from "@/lib/auth-helpers";
import { businessCookieName, businessFor, employeeBusinessWhere, resolveBusiness } from "@/lib/business";

export const getActiveBusiness = cache(async () => {
  const session = await requireAuth();
  const stored = (await cookies()).get(businessCookieName(session.user.id))?.value;
  // Old bookmarked section filters work on the first visit. Once selected,
  // the global preference wins over stale section filters and links.
  const requestUrl = (await headers()).get("x-portal-url");
  const url = requestUrl ? new URL(requestUrl) : null;
  const legacy = url && (businessFor(url.searchParams.get("company"))
    ?? businessFor(url.searchParams.get("business"))
    ?? businessFor(url.searchParams.get("segment"))
    ?? (url.pathname.startsWith("/finance/payroll/mobile-grooming") ? businessFor("GROOMING") : undefined));
  return resolveBusiness(session.user, stored ?? legacy?.company);
});

export async function getEmployeeBusinessWhere() {
  const [session, business] = await Promise.all([requireAuth(), getActiveBusiness()]);
  return employeeBusinessWhere(session.user, business.company);
}
