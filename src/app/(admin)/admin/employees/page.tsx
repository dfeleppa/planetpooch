import { requireManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
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

const COMPANY_SHORT: Record<Company, string> = {
  GROOMING: "PPG",
  RESORT: "PPR",
  CORPORATE: "PPC",
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

type ProgressFilter = "all" | "atrisk" | "notstarted" | "done";

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
const VALID_PROGRESS: ReadonlySet<ProgressFilter> = new Set([
  "all",
  "atrisk",
  "notstarted",
  "done",
]);

function parseSort(raw: string | undefined, tab: Tab): SortKey {
  if (raw && VALID_SORTS.has(raw as SortKey)) {
    const opt = SORT_OPTIONS.find((o) => o.key === raw);
    if (opt && opt.tabs.includes(tab)) return raw as SortKey;
  }
  return tab === "terminated" ? "terminated-new" : "name";
}

function parseProgress(raw: string | undefined): ProgressFilter {
  if (raw && VALID_PROGRESS.has(raw as ProgressFilter)) return raw as ProgressFilter;
  return "all";
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
      return null;
  }
}

function relTime(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function tenureDays(hireDate: Date | null, createdAt: Date): number {
  const ref = hireDate ?? createdAt;
  return Math.floor((Date.now() - ref.getTime()) / 86400000);
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
    progress?: string;
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
  const progress: ProgressFilter = tab === "active" ? parseProgress(sp.progress) : "all";

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
      hireDate: true,
      createdAt: true,
      terminatedAt: true,
      terminationReason: true,
    },
  });

  const totalLessons = await prisma.lesson.count();

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

  // Decorate each employee with progress state for filtering, KPIs, and the
  // roster row. Only EMPLOYEE-role users have meaningful training progress;
  // managers/admins are excluded from the at-risk/done aggregate.
  type Decorated = (typeof employees)[number] & {
    completed: number;
    pct: number;
    atRisk: boolean;
    isDone: boolean;
    isNotStarted: boolean;
    hasTraining: boolean;
  };

  const decorated: Decorated[] = employees.map((emp) => {
    const completed = completionCounts.get(emp.id) ?? 0;
    const hasTraining = emp.role === "EMPLOYEE" && totalLessons > 0;
    const pct = hasTraining ? Math.round((completed / totalLessons) * 100) : 0;
    const tenure = tenureDays(emp.hireDate, emp.createdAt);
    const atRisk = hasTraining && pct < 50 && tenure > 21;
    const isDone = hasTraining && pct === 100;
    const isNotStarted = hasTraining && completed === 0;
    return { ...emp, completed, pct, atRisk, isDone, isNotStarted, hasTraining };
  });

  // KPI counts use the decorated set BEFORE the chip filter is applied.
  const trained = decorated.filter((e) => e.hasTraining);
  const kpiTotal = decorated.length;
  const kpiAvg =
    trained.length > 0
      ? Math.round(trained.reduce((s, e) => s + e.pct, 0) / trained.length)
      : 0;
  const kpiDone = decorated.filter((e) => e.isDone).length;
  const kpiAtRisk = decorated.filter((e) => e.atRisk).length;
  const kpiNotStarted = decorated.filter((e) => e.isNotStarted).length;

  const progressCounts = {
    all: kpiTotal,
    atrisk: kpiAtRisk,
    notstarted: kpiNotStarted,
    done: kpiDone,
  };

  // Apply chip filter
  let filtered = decorated;
  if (progress === "atrisk") filtered = filtered.filter((e) => e.atRisk);
  else if (progress === "notstarted") filtered = filtered.filter((e) => e.isNotStarted);
  else if (progress === "done") filtered = filtered.filter((e) => e.isDone);

  // In-memory sort for progress — completion counts aren't a User column.
  if (sort === "progress-high" || sort === "progress-low") {
    const dir = sort === "progress-high" ? -1 : 1;
    filtered = [...filtered].sort((a, b) => {
      if (a.completed !== b.completed) return (a.completed - b.completed) * dir;
      return a.name.localeCompare(b.name);
    });
  }

  const pastCount = await prisma.user.count({
    where: { ...companyWhere, terminatedAt: { not: null } },
  });
  const activeCount =
    tab === "active" ? kpiTotal : await prisma.user.count({
      where: { ...companyWhere, terminatedAt: null },
    });

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

  const hasActiveFilters = !!(
    q ||
    companyParam ||
    jobTitleParam ||
    sp.sort ||
    (progress && progress !== "all")
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Page head */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="pp-h1">Employees</h1>
          <p className="pp-sub">
            {tab === "terminated"
              ? "Past employees — records preserved for retention."
              : "Track training progress across companies and roles."}
          </p>
        </div>
        {tab === "active" && (
          <div className="flex items-start gap-3">
            <CheckPendingEsignaturesButton pendingCount={pendingEsignCount} />
            <Link href="/admin/employees/new" className="pp-btn pp-btn-primary">
              + Add Employee
            </Link>
          </div>
        )}
      </div>

      {/* KPI strip — only on active tab */}
      {tab === "active" && (
        <div className="pp-kpis">
          <div className="pp-kpi">
            <div className="pp-kpi-label">Active employees</div>
            <div className="pp-kpi-value">{kpiTotal}</div>
            <div className="pp-kpi-meta">
              across {Object.keys(COMPANY_LABELS).length} companies
            </div>
          </div>
          <div className="pp-kpi">
            <div className="pp-kpi-label">Avg. completion</div>
            <div className="pp-kpi-value">
              {kpiAvg}
              <span className="pp-kpi-unit">%</span>
            </div>
            <div className="pp-kpi-bar">
              <div className="pp-kpi-bar-fill" style={{ width: `${kpiAvg}%` }} />
            </div>
          </div>
          <div className="pp-kpi">
            <div className="pp-kpi-label">Fully trained</div>
            <div className="pp-kpi-value">{kpiDone}</div>
            <div className="pp-kpi-meta">
              {trained.length > 0
                ? `${Math.round((kpiDone / trained.length) * 100)}% of roster`
                : "—"}
            </div>
          </div>
          <div className={`pp-kpi ${kpiAtRisk > 0 ? "pp-kpi-warn" : ""}`}>
            <div className="pp-kpi-label">
              At risk{kpiAtRisk > 0 && <span className="pp-kpi-pip" />}
            </div>
            <div className="pp-kpi-value">{kpiAtRisk}</div>
            <div className="pp-kpi-meta">below 50% &amp; &gt;3 wks tenure</div>
          </div>
          <div className="pp-kpi">
            <div className="pp-kpi-label">Not started</div>
            <div className="pp-kpi-value">{kpiNotStarted}</div>
            <div className="pp-kpi-meta">need module assignment</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="pp-tabs">
        <Link
          href="/admin/employees"
          className={`pp-tab ${tab === "active" ? "is-on" : ""}`}
        >
          Active <span className="pp-tab-count">{activeCount}</span>
        </Link>
        <Link
          href="/admin/employees?status=terminated"
          className={`pp-tab ${tab === "terminated" ? "is-on" : ""}`}
        >
          Past Employees <span className="pp-tab-count">{pastCount}</span>
        </Link>
      </div>

      {/* Toolbar */}
      <EmployeeFilters
        tab={tab}
        isSuperAdmin={isSuperAdmin}
        q={q}
        company={companyParam ?? ""}
        jobTitle={jobTitleParam}
        sort={sort}
        progress={progress}
        defaultSort={tab === "terminated" ? "terminated-new" : "name"}
        jobTitleOptions={jobTitleOptions}
        sortOptions={sortOptions.map((o) => ({ key: o.key, label: o.label }))}
        companyLabels={COMPANY_LABELS}
        progressCounts={progressCounts}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Roster */}
      <div className="pp-roster">
        <div className="pp-roster-head">
          <div className="pp-rcol pp-rcol-name">Name</div>
          <div className="pp-rcol">Role</div>
          <div className="pp-rcol">Company</div>
          <div className="pp-rcol">Modules</div>
          <div className="pp-rcol">Training progress</div>
          <div className="pp-rcol">Joined</div>
          <div className="pp-rcol" />
        </div>

        {filtered.map((emp) => {
          const isTerminated = !!emp.terminatedAt;
          const refDate = emp.hireDate ?? emp.createdAt;
          const roleLabel =
            emp.jobTitle ||
            (emp.role !== "EMPLOYEE" ? ROLE_LABELS[emp.role] ?? null : null) ||
            "—";
          return (
            <div
              key={emp.id}
              className={`pp-row ${emp.atRisk ? "is-risk" : ""}`}
            >
              <div className="pp-rcol pp-rcol-name">
                <div className="pp-name-line">
                  <Link
                    href={`/admin/employees/${emp.id}`}
                    className="pp-name pp-name-link"
                  >
                    {emp.lastName}, {emp.firstName}
                  </Link>
                  {emp.atRisk && <span className="pp-flag pp-flag-warn">At risk</span>}
                  {emp.isDone && <span className="pp-flag pp-flag-ok">Complete</span>}
                  {isTerminated && (
                    <span className="pp-flag pp-flag-muted">Past employee</span>
                  )}
                  {!isTerminated &&
                    emp.role !== "EMPLOYEE" &&
                    ROLE_LABELS[emp.role] && (
                      <span className="pp-flag pp-flag-muted">
                        {ROLE_LABELS[emp.role]}
                      </span>
                    )}
                </div>
                <div className="pp-email">{emp.email}</div>
              </div>
              <div className="pp-rcol pp-rcol-role">{roleLabel}</div>
              <div className="pp-rcol">
                <span className="pp-company" title={COMPANY_LABELS[emp.company]}>
                  {COMPANY_SHORT[emp.company]}
                </span>
              </div>
              <div className="pp-rcol">
                {emp.hasTraining ? (
                  <span className="pp-mono">
                    {emp.completed}
                    <span className="pp-mono-dim">/{totalLessons}</span>
                  </span>
                ) : (
                  <span className="pp-mono pp-mono-dim">—</span>
                )}
              </div>
              <div className="pp-rcol">
                {emp.hasTraining ? (
                  <div className="pp-progress">
                    <div className="pp-progress-track">
                      <div
                        className={`pp-progress-fill ${
                          emp.isDone ? "is-done" : emp.atRisk ? "is-risk" : ""
                        }`}
                        style={{ width: `${emp.pct}%` }}
                      />
                    </div>
                    <div className="pp-progress-num">{emp.pct}%</div>
                  </div>
                ) : (
                  <span className="text-pp-ink-4 text-[12px]">No training</span>
                )}
              </div>
              <div className="pp-rcol">
                {isTerminated && emp.terminatedAt ? (
                  <>
                    <div className="pp-activity">
                      Term {relTime(emp.terminatedAt)}
                    </div>
                    <div className="pp-activity-sub">
                      {formatDate(emp.terminatedAt)}
                      {emp.terminationReason && ` · ${emp.terminationReason}`}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pp-activity">{relTime(refDate)}</div>
                    <div className="pp-activity-sub">
                      Joined {formatDate(refDate)}
                    </div>
                  </>
                )}
              </div>
              <div className="pp-rcol" style={{ textAlign: "right" }}>
                <Link
                  href={`/admin/employees/${emp.id}`}
                  className="pp-row-link"
                >
                  View →
                </Link>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="pp-empty">
            {hasActiveFilters
              ? "No employees match the current filters."
              : tab === "terminated"
              ? "No past employees."
              : "No employees registered yet."}
          </div>
        )}
      </div>

      {/* Footer count */}
      <div className="pp-pagination">
        <span className="pp-page-info">
          Showing {filtered.length} of {kpiTotal}
        </span>
      </div>
    </div>
  );
}
