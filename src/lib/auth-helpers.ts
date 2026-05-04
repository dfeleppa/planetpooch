import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { redirect } from "next/navigation";
import { Company, Role } from "@prisma/client";

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/** Requires MANAGER or SUPER_ADMIN (or legacy ADMIN). Use for most admin pages. */
export async function requireManager() {
  const session = await requireAuth();
  const role = (session.user as { role: Role }).role;
  if (
    role !== "MANAGER" &&
    role !== "SUPER_ADMIN" &&
    role !== "ADMIN"
  ) {
    redirect("/dashboard");
  }
  return session;
}

/**
 * Requires SUPER_ADMIN (or legacy ADMIN). Use for module/lesson management
 * and other top-tier admin actions.
 */
export async function requireSuperAdmin() {
  const session = await requireAuth();
  const role = (session.user as { role: Role }).role;
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    redirect("/admin");
  }
  return session;
}

/** Requires MARKETING or SUPER_ADMIN, or the CMO job title. Use for /marketing pages. */
export async function requireMarketing() {
  const session = await requireAuth();
  const user = session.user as { role: Role; jobTitle: string | null };
  if (!hasMarketingAccess(user.role, user.jobTitle)) {
    redirect("/dashboard");
  }
  return session;
}

/**
 * Returns a Prisma `where` filter to scope queries to the user's company.
 * SUPER_ADMIN: no filter (sees all companies).
 * MANAGER: filters to their own company.
 */
export function getCompanyFilter(
  role: Role,
  company: Company | null
): { company?: Company } {
  if (role === "MANAGER" && company) {
    return { company };
  }
  return {};
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure predicates — for API routes which can't use `redirect()`. Pair with
// `getSession()` + a 403 JSON response.
// ──────────────────────────────────────────────────────────────────────────────

/** True if the role has manager-level access (MANAGER, SUPER_ADMIN, or legacy ADMIN). */
export function isManagerOrAbove(role: string | undefined | null): boolean {
  return (
    role === "MANAGER" ||
    role === "SUPER_ADMIN" ||
    role === "ADMIN"
  );
}

/** True if the role is SUPER_ADMIN or legacy ADMIN — the top tier. */
export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/**
 * True if the user can access /marketing. Grants access to the MARKETING role,
 * to top-tier admins (SUPER_ADMIN / legacy ADMIN), and to anyone with the CMO
 * job title regardless of role.
 */
export function hasMarketingAccess(
  role: string | undefined | null,
  jobTitle?: string | undefined | null
): boolean {
  if (role === "MARKETING" || role === "SUPER_ADMIN" || role === "ADMIN") {
    return true;
  }
  return jobTitle === "CMO";
}

// Keep requireAdmin as an alias for backward compatibility during migration
export const requireAdmin = requireManager;

/**
 * Prisma `where` filter snippet for "active" users (i.e. not terminated).
 * Use this anywhere the app lists employees who should currently appear in
 * pickers, dashboards, or the active employees view. For the Past Employees
 * view, swap it for `{ terminatedAt: { not: null } }`.
 *
 * Spread it into your existing where clause:
 *   prisma.user.findMany({ where: { role: "EMPLOYEE", ...activeUserWhere() } })
 */
export function activeUserWhere(): { terminatedAt: null } {
  return { terminatedAt: null };
}
