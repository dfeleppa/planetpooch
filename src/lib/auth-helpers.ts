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

/** Requires MANAGER or SUPER_ADMIN. Use for most admin pages. */
export async function requireManager() {
  const session = await requireAuth();
  const role = (session.user as { role: Role }).role;
  if (role !== "MANAGER" && role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }
  return session;
}

/** Requires SUPER_ADMIN only. Use for module/lesson management. */
export async function requireSuperAdmin() {
  const session = await requireAuth();
  const role = (session.user as { role: Role }).role;
  if (role !== "SUPER_ADMIN") {
    redirect("/admin");
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

// Keep requireAdmin as an alias for backward compatibility during migration
export const requireAdmin = requireManager;
