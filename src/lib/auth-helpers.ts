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
 * Requires manager-tier employee access: MANAGER+, or anyone with the
 * Front Desk Staff job title. Use for /admin/employees pages — Front Desk
 * Staff sit just above floor staff and in-house grooming and can manage
 * employees within their company without delete privileges.
 */
export async function requireEmployeeManager() {
  const session = await requireAuth();
  const user = session.user as { role: Role; jobTitle: string | null };
  if (!hasEmployeeManagementAccess(user.role, user.jobTitle)) {
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
 * MANAGER and Front Desk Staff: filters to their own company.
 * `jobTitle` is optional for backward compatibility with non-employee
 * routes that don't surface Front Desk Staff.
 */
export function getCompanyFilter(
  role: Role,
  company: Company | null,
  jobTitle?: string | null
): { company?: Company } {
  const scoped = role === "MANAGER" || isFrontDesk(jobTitle);
  if (scoped && company) {
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
 * "Front Desk Staff" is a job title that sits above floor staff and in-house
 * grooming. It grants manager-tier employee access and module edit access
 * without delete privileges, regardless of the underlying role.
 */
export const FRONT_DESK_JOB_TITLE = "Front Desk Staff";

export function isFrontDesk(jobTitle: string | undefined | null): boolean {
  return jobTitle === FRONT_DESK_JOB_TITLE;
}

/**
 * True if the user can manage modules and lessons end-to-end including
 * delete. Top-tier admins always qualify, plus anyone with the CMO job
 * title regardless of role. Front Desk Staff are NOT included — they get
 * edit access via `hasModuleEditAccess`, but cannot delete.
 */
export function hasModuleManagementAccess(
  role: string | undefined | null,
  jobTitle?: string | undefined | null
): boolean {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  return jobTitle === "CMO";
}

/**
 * True if the user can edit modules, subsections, and lessons (create,
 * update, reorder, assign). Superset of `hasModuleManagementAccess` that
 * also includes Front Desk Staff. Use this for non-delete module operations;
 * use `hasModuleManagementAccess` for delete.
 */
export function hasModuleEditAccess(
  role: string | undefined | null,
  jobTitle?: string | undefined | null
): boolean {
  if (hasModuleManagementAccess(role, jobTitle)) return true;
  return isFrontDesk(jobTitle);
}

/**
 * True if the user can manage employee records (view, edit, create).
 * MANAGER+ qualify, plus anyone with the Front Desk Staff job title.
 * Hard delete remains gated by `isSuperAdmin`; end-employment remains
 * gated by `isManagerOrAbove`.
 */
export function hasEmployeeManagementAccess(
  role: string | undefined | null,
  jobTitle?: string | undefined | null
): boolean {
  if (isManagerOrAbove(role)) return true;
  return isFrontDesk(jobTitle);
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
