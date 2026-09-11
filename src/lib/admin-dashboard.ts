import { requireSuperAdmin, activeUserWhere } from "./auth-helpers";
import { getActiveBusiness, getEmployeeBusinessWhere } from "./business-server";
import { prisma } from "./prisma";
import { dashboardPeriods } from "./dashboard-periods";
import { addWeeks, toWeekParam } from "./week";
import { REVENUE_ORDER_STATUSES } from "./moego/metrics";

export async function getAdminDashboard() {
  // Keep authorization at the data boundary as well as in the proxy/sidebar.
  await requireSuperAdmin();
  const business = await getActiveBusiness();
  const now = new Date();
  const periods = dashboardPeriods(business.company, now);
  const employeeWhere = { ...await getEmployeeBusinessWhere(), ...activeUserWhere() };
  const openTasksWhere = {
    company: business.company,
    status: { in: ["PENDING", "IN_PROGRESS"] as ("PENDING" | "IN_PROGRESS")[] },
  };
  const overdueWhere = { ...openTasksWhere, dueDate: { lt: now } };

  const [salesResult, payrollResult, operationsResult, teamResult, checklistResult] = await Promise.allSettled([
    (async () => {
      const [rows, sync] = await Promise.all([
        prisma.$queryRaw<{ weekStart: Date; netSalesCents: bigint; orderCount: bigint }[]>`
          SELECT
            (date_trunc('week', COALESCE("salesDatetime", "completedTime", "createdTime") + interval '1 day') - interval '1 day')::date AS "weekStart",
            SUM("subTotalCents" - "discountCents")::bigint AS "netSalesCents",
            COUNT(*)::bigint AS "orderCount"
          FROM "MoegoOrder"
          WHERE "businessId" = ${business.moegoId}
            AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
            AND COALESCE("salesDatetime", "completedTime", "createdTime") >= ${periods.trendStart}
            AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${periods.weekEndExclusive}
          GROUP BY 1
          ORDER BY 1
        `,
        prisma.moegoSyncState.findUnique({ where: { resource: "order" }, select: { lastSyncedAt: true } }),
      ]);
      const byWeek = new Map(rows.map((row) => [toWeekParam(row.weekStart), row]));
      return {
        syncedAt: sync?.lastSyncedAt ?? null,
        weeks: Array.from({ length: 6 }, (_, index) => {
          const weekStart = addWeeks(periods.trendStart, index);
          const row = byWeek.get(toWeekParam(weekStart));
          return {
            weekStart,
            // An absent week does not establish zero revenue or complete sync coverage.
            netSalesCents: row ? Number(row.netSalesCents) : null,
            orderCount: row ? Number(row.orderCount) : null,
          };
        }),
      };
    })(),
    (async () => {
      const [week, reviewCount, runs] = await Promise.all([
        prisma.financePayrollWeek.findUnique({
          where: { business_weekStart: { business: business.key, weekStart: periods.payrollWeekStart } },
          select: { automationStatus: true, rows: { select: { totalSeconds: true } } },
        }),
        prisma.financePayrollWeek.count({ where: { business: business.key, automationStatus: "needs_review" } }),
        business.company === "RESORT"
          ? prisma.financePetResortPayrollRun.findMany({
              where: { checkDate: periods.payrollCheckDate }, select: { amount: true },
            })
          : Promise.resolve([]),
      ]);
      return {
        reviewCount,
        status: week?.automationStatus ?? null,
        totalHours: week?.rows.length ? week.rows.reduce((sum, row) => sum + row.totalSeconds, 0) / 3600 : null,
        totalCents: runs.length ? runs.reduce((sum, run) => sum + Math.round(Number(run.amount) * 100), 0) : null,
      };
    })(),
    (async () => {
      const [overdueCount, overdueTasks, upcomingCount, inventory] = await Promise.all([
        prisma.maintenanceTask.count({ where: overdueWhere }),
        prisma.maintenanceTask.findMany({
          where: overdueWhere, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 5,
          select: { id: true, title: true, dueDate: true, assignedTo: { select: { name: true } } },
        }),
        prisma.maintenanceTask.count({
          where: { ...openTasksWhere, dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } },
        }),
        prisma.inventoryItem.findMany({
          where: { company: business.company, minimumThreshold: { gt: 0 } },
          select: { currentQuantity: true, minimumThreshold: true },
        }),
      ]);
      return {
        overdueCount, overdueTasks, upcomingCount,
        lowInventoryCount: inventory.filter((item) => item.currentQuantity <= item.minimumThreshold).length,
      };
    })(),
    (async () => {
      const [activeCount, companyCount, neverLoggedInCount] = await Promise.all([
        prisma.user.count({ where: employeeWhere }),
        prisma.user.count({ where: { ...activeUserWhere(), company: business.company } }),
        prisma.user.count({ where: { ...employeeWhere, lastLoginAt: null } }),
      ]);
      return { activeCount, companyCount, corporateCount: activeCount - companyCount, neverLoggedInCount };
    })(),
    business.company === "RESORT"
      ? prisma.dailyChecklistItem.findMany({
          where: { OR: [{ isActive: true }, { completions: { some: { date: periods.today } } }] },
          select: { period: true, completions: { where: { date: periods.today }, select: { id: true } } },
        }).then((items) => (["AM", "PM"] as const).map((period) => {
          const periodItems = items.filter((item) => item.period === period);
          return { period, total: periodItems.length, completed: periodItems.filter((item) => item.completions.length > 0).length };
        }))
      : Promise.resolve(null),
  ]);

  const unavailable: string[] = [];
  function readSection<T>(name: string, result: PromiseSettledResult<T>): T | null {
    if (result.status === "fulfilled") return result.value;
    console.error(`[admin-dashboard] ${name} failed`, result.reason);
    unavailable.push(name);
    return null;
  }

  const sales = readSection("Sales", salesResult);
  const payroll = readSection("Payroll", payrollResult);
  const operations = readSection("Operations", operationsResult);
  const team = readSection("Team", teamResult);
  const checklists = readSection("Daily checklists", checklistResult);
  return { business, now, periods, sales, payroll, operations, team, checklists, unavailable };
}

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboard>>;
