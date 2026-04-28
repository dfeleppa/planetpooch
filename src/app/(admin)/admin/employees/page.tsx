import { requireManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Company, Prisma, Role } from "@prisma/client";
import { EmployeeFilters } from "./EmployeeFilters";
import { CheckPendingEsignaturesButton } from "./CheckPendingEsignaturesButton";

const COMPANY_LABELS: Record<Company, string> = {
  GROOMING: "Planet Pooch Grooming",
  RESORT: "Planet Pooch Resort",
  CORPORATE: "Planet Pooch Corporate",
};

const ROLE_LABELS: Partial<Record<Role, string>> = {
  SUPER_ADMIN: "Super Admin",
  DOS: "DOS",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

type Tab = "active" | "terminated";

type SortKey =
  | "name"
  | "hired-new"
  | "hired-old"
  | "progress-high"
  | "progress-low"
  | "terminated-new"
  | "terminated-old";

const SORT_OPTIONS: { key: SortKey; label: string; tabs: Tab[] }[] = [
  { key: "name", label: "Name (A–Z)", tabs: ["active", "terminated"] },
  { key: "hired-new", label: "Hire date (newest)", tabs: ["active", "terminated"] },
  { key: "hired-old", label: "Hire date (oldest)", tabs: ["active", "terminated"] },
  { key: "progress-high", label: "Most training progress", tabs: ["active"] },
  { key: "progress-low", label: "Least training progress", tabs: ["active"] },
  { key: "terminated-new", label: "Recently terminated", tabs: ["terminated"] },
  { key: "terminated-old", label: "Earliest terminated", tabs: ["terminated"] },
];

const VALID_SORTS: ReadonlySet<SortKey> = new Set(SORT_OPTIONS.map((o) => o.key));

function parseSort(raw: string | undefined, tab: Tab): SortKey {
  if (raw && VALID_SORTS.has(raw as SortKey)) {
    const opt = SORT_OPTIONS.find((o) => o.key === raw);
    if (opt && opt.tabs.includes(tab)) return raw as SortKey;
  }
  return tab === "terminated" ? "terminated-new" : "name";
}

function prismaOrderBy(sort: SortKey): Prisma.UserOrderByWithRelationInput[] | null {
  switch (sort) {
    case "name":
      return [{ lastName: "asc" }, { firstName: "asc" }];
    case "hired-new":
      return [{ hireDate: { sort: "desc", nulls: "last" } }, { lastName: "asc" }];
    case "hired-old":
      return [{ hireDate: { sort: "asc", nulls: "last" } }, { lastName: "asc" }];
    case "terminated-new":
      return [{ terminatedAt: "desc" }, { lastName: "asc" }];
    case "terminated-old":
      return [{ terminatedAt: "asc" }, { lastName: "asc" }];
    case "progress-high":
    case "progress-low":
      // Sorted in memory after the completion counts are joined in.
      return null;
  }
}

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    company?: string;
    jobTitle?: string;
    sort?: string;
  }>;
}) {
  const session = await requireManager();
  const sessionUser = session.user as { role: Role; company: Company };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  const isSuperAdmin = sessionUser.role === "SUPER_ADMIN" || sessionUser.role === "ADMIN";

  const sp = await searchParams;
  const tab: Tab = sp.status === "terminated" ? "terminated" : "active";
  const q = (sp.q ?? "").trim();
  const companyParam = ["GROOMING", "RESORT", "CORPORATE"].includes(sp.company ?? "")
    ? (sp.company as Company)
    : null;
  const jobTitleParam = (sp.jobTitle ?? "").trim();
  const sort = parseSort(sp.sort, tab);

  const terminationFilter =
    tab === "terminated"
      ? { terminatedAt: { not: null } }
      : { terminatedAt: null };

  // SUPER_ADMIN can narrow with the dropdown; MANAGER is already scoped to
  // their own company by `getCompanyFilter` and ignores the param.
  const companyWhere =
    isSuperAdmin && companyParam ? { company: companyParam } : companyFilter;

  const where: Prisma.UserWhereInput = {
    ...companyWhere,
    ...terminationFilter,
    ...(jobTitleParam ? { jobTitle: jobTitleParam } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy = prismaOrderBy(sort);

  const employees = await prisma.user.findMany({
    where,
    ...(orderBy ? { orderBy } : {}),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      email: true,
      role: true,
      company: true,
      jobTitle: true,
      createdAt: true,
      terminatedAt: true,
      terminationReason: true,
    },
  });

  const totalLessons = await prisma.lesson.count();

  // Pending eSign requests in scope (manager → own company; admin → all).
  // Only relevant on the active tab; past-employee view stays clean.
  const pendingEsignCount =
    tab === "active"
      ? await prisma.esignRequest.count({
          where: {
            status: "SENT",
            ...(companyFilter.company
              ? { user: { company: companyFilter.company } }
              : {}),
          },
        })
      : 0;

  const completions = await prisma.lessonCompletion.findMany({
    where: { isCompleted: true, userId: { in: employees.map((e) => e.id) } },
    select: { userId: true },
  });

  const completionCounts = new Map<string, number>();
  for (const c of completions) {
    completionCounts.set(c.userId, (completionCounts.get(c.userId) || 0) + 1);
  }

  // In-memory sort for progress — completion counts aren't a User column.
  const sortedEmployees = [...employees];
  if (sort === "progress-high" || sort === "progress-low") {
    const dir = sort === "progress-high" ? -1 : 1;
    sortedEmployees.sort((a, b) => {
      const da = completionCounts.get(a.id) ?? 0;
      const db = completionCounts.get(b.id) ?? 0;
      if (da !== db) return (da - db) * dir;
      return a.name.localeCompare(b.name);
    });
  }

  // Job-title dropdown options, scoped to the current tab + company so the
  // list only shows titles that can actually return results.
  const jobTitleRows = await prisma.user.findMany({
    where: {
      ...companyWhere,
      ...terminationFilter,
      jobTitle: { not: null },
    },
    select: { jobTitle: true },
    distinct: ["jobTitle"],
    orderBy: { jobTitle: "asc" },
  });
  const jobTitleOptions = jobTitleRows
    .map((r) => r.jobTitle)
    .filter((t): t is string => !!t);

  const sortOptions = SORT_OPTIONS.filter((o) => o.tabs.includes(tab));

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 mt-1">
            {tab === "terminated"
              ? "Past employees — records preserved for retention."
              : "Track employee training progress"}
          </p>
        </div>
        {tab === "active" && (
          <div className="flex items-start gap-3">
            <CheckPendingEsignaturesButton pendingCount={pendingEsignCount} />
            <Link href="/admin/employees/new">
              <Button>+ Add Employee</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200 flex gap-6">
        <Link
          href="/admin/employees"
          className={`pb-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
            tab === "active"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Active
        </Link>
        <Link
          href="/admin/employees?status=terminated"
          className={`pb-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
            tab === "terminated"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Past Employees
        </Link>
      </div>

      <EmployeeFilters
        tab={tab}
        isSuperAdmin={isSuperAdmin}
        q={q}
        company={companyParam ?? ""}
        jobTitle={jobTitleParam}
        sort={sort}
        defaultSort={tab === "terminated" ? "terminated-new" : "name"}
        jobTitleOptions={jobTitleOptions}
        sortOptions={sortOptions.map((o) => ({ key: o.key, label: o.label }))}
        companyLabels={COMPANY_LABELS}
        hasActiveFilters={!!(q || companyParam || jobTitleParam || sp.sort)}
      />

      <div className="grid gap-4 mt-4">
        {sortedEmployees.map((emp) => {
          const completed = completionCounts.get(emp.id) || 0;
          const isTerminated = !!emp.terminatedAt;
          return (
            <Card
              key={emp.id}
              className={`hover:shadow-md transition-shadow ${
                isTerminated ? "opacity-75" : ""
              }`}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/admin/employees/${emp.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {emp.lastName}, {emp.firstName}
                      </Link>
                      {emp.jobTitle && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {emp.jobTitle}
                        </span>
                      )}
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {COMPANY_LABELS[emp.company]}
                      </span>
                      {emp.role !== "EMPLOYEE" && ROLE_LABELS[emp.role] && (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          {ROLE_LABELS[emp.role]}
                        </span>
                      )}
                      {isTerminated && (
                        <Badge variant="default">Past employee</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{emp.email}</p>
                    {isTerminated && emp.terminatedAt ? (
                      <p className="text-xs text-gray-400 mt-1">
                        Terminated {formatDate(emp.terminatedAt)}
                        {emp.terminationReason && ` · ${emp.terminationReason}`}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">
                        Joined {formatDate(emp.createdAt)}
                      </p>
                    )}
                    {!isTerminated && emp.role === "EMPLOYEE" && (
                      <ProgressBar
                        value={completed}
                        max={totalLessons}
                        className="mt-2"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/admin/employees/${emp.id}`}>
                      <Badge variant="info">View Details</Badge>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sortedEmployees.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              {q || companyParam || jobTitleParam
                ? "No employees match the current filters."
                : tab === "terminated"
                ? "No past employees."
                : "No employees registered yet."}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
