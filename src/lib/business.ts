/** View preferences only. These values never replace a user's saved company. */
export const BUSINESSES = [
  { company: "RESORT", label: "Pet Resort", key: "pet-resort", moegoId: "biz3pcO" },
  { company: "GROOMING", label: "Mobile Grooming", key: "mobile-grooming", moegoId: "bizVdfk" },
] as const;

export type Business = (typeof BUSINESSES)[number];
export type BusinessCompany = Business["company"];
export type BusinessUser = { id: string; role?: string; company?: string | null; jobTitle?: string | null };

export function businessFor(value: unknown): Business | undefined {
  return BUSINESSES.find((business) =>
    business.company === value || business.key === value || business.moegoId === value ||
    (business.company === "RESORT" && (value === "PET_RESORT" || value === "PET_RESORT_COPY")) ||
    (business.company === "GROOMING" && value === "MOBILE_GROOMING"),
  );
}

export function availableBusinesses(user: BusinessUser): readonly Business[] {
  const assigned = businessFor(user.company);
  if (assigned && (user.role === "MANAGER" || user.role === "EMPLOYEE") && user.jobTitle !== "CMO") {
    return [assigned];
  }
  return BUSINESSES;
}

export function resolveBusiness(user: BusinessUser, preference?: unknown): Business {
  const available = availableBusinesses(user);
  const requested = businessFor(preference);
  return available.find((business) => business.company === requested?.company)
    ?? available.find((business) => business.company === user.company)
    ?? available[0];
}

export function businessCookieName(userId: string): string {
  return `portal-business-${encodeURIComponent(userId)}`;
}

/** Compare with the public Host header; NextRequest.url can use an internal host. */
export function isBusinessSwitchOriginAllowed(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || url.protocol === "http:") && url.host === host.toLowerCase();
  } catch { return false; }
}

/** Intersect the view with the existing manager permission boundary. */
export function employeeBusinessWhere(user: BusinessUser, company: BusinessCompany) {
  if (user.role === "MANAGER" && user.company) {
    const allowed = user.company === company || user.company === "CORPORATE";
    return { company: { in: allowed ? [user.company as "RESORT" | "GROOMING" | "CORPORATE"] : [] } };
  }
  // Corporate staff support both businesses and keep their existing records.
  return { company: { in: [company, "CORPORATE" as const] } };
}

/** Leave record/edit screens when switching so a form cannot target the old business. */
export function businessSwitchPath(href: string, company: BusinessCompany): string {
  let url: URL;
  try { url = new URL(href, "https://portal.invalid"); }
  catch { return "/dashboard"; }
  if (url.origin !== "https://portal.invalid") return "/dashboard";
  let path = url.pathname;
  if (/^\/admin\/employees\/.+/.test(path)) path = "/admin/employees";
  if (/^\/admin\/modules\/.+/.test(path)) path = "/admin/modules";
  if (/^\/modules\/.+/.test(path)) path = "/modules";
  if (/^\/maintenance\/(inventory|schedules|tasks)\/.+/.test(path)) path = path.split("/").slice(0, 3).join("/");
  if (/^\/marketing\/(create|ideas|scripts)\/.+/.test(path)) path = "/marketing/create";
  if (path === "/finance/moego" || path.startsWith("/finance/moego/customers/")) path = "/finance/profit-loss";
  if (path.startsWith("/finance/payroll")) {
    path = company === "GROOMING" ? "/finance/payroll/mobile-grooming"
      : path.endsWith("/commissions") ? path : "/finance/payroll";
  }
  if (company === "GROOMING" && (path.startsWith("/operations/daycare") || path === "/maintenance/checklists" || path === "/career")) path = "/maintenance";
  const allowed = ["/admin", "/dashboard", "/modules", "/career", "/search", "/maintenance", "/operations", "/finance", "/marketing"];
  if (!allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return "/dashboard";
  for (const key of ["company", "business", "segment", "jobTitle", "serviceLine", "page", "q"]) url.searchParams.delete(key);
  if (path !== url.pathname) url.search = "";
  return `${path}${url.search}`;
}
