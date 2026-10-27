type PeopleUser = { role?: string | null; company?: string | null } | null | undefined;

/** Saved Corporate assignment plus the existing employee-management role. */
export function canManageEmployeeLifecycle(user: PeopleUser): boolean {
  return user?.company === "CORPORATE" && ["MANAGER", "SUPER_ADMIN"].includes(user.role ?? "");
}

/** Corporate People covers all companies; business People stays in its own company. */
export function employeeCompanyFilter(_role: unknown, company: "RESORT" | "GROOMING" | "CORPORATE" | null, _jobTitle?: unknown): { company?: "RESORT" | "GROOMING" } {
  void _role;
  void _jobTitle;
  if (company === "CORPORATE") return {};
  if (!company) throw new Error("Employee access requires a saved company");
  return { company };
}
