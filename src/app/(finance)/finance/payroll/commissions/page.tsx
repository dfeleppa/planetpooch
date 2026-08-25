import { KpiSegment } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PayrollSubnav } from "../PayrollSubnav";
import { CommissionsLedger, type CommissionRow } from "./CommissionsLedger";

const REBECCA_METRICS = ["product_sales", "group_revenue", "one_on_one_revenue"] as const;
const GABRIELA_METRICS = ["revenue", "upsells"] as const;

interface WeeklyMetricValue {
  weekStart: Date;
  metricKey: string;
  value: number | null;
}

interface PaidDateEntry {
  id: string;
  weekStart: Date;
  paidDate: Date | null;
  updatedAt: Date;
}

function buildCommissionRows(
  values: WeeklyMetricValue[],
  metricKeys: readonly string[],
  paidDates: PaidDateEntry[]
): CommissionRow[] {
  const paidDateByWeek = new Map(
    paidDates.map((entry) => [entry.weekStart.toISOString().slice(0, 10), entry])
  );
  const rowByWeek = new Map<string, CommissionRow>();

  for (const value of values) {
    const weekStart = value.weekStart.toISOString().slice(0, 10);
    const existing = rowByWeek.get(weekStart);
    const weekEndingDate = new Date(value.weekStart);
    weekEndingDate.setUTCDate(weekEndingDate.getUTCDate() + 6);
    const paidEntry = paidDateByWeek.get(weekStart);
    const row = existing ?? {
      weekStart,
      weekEnding: weekEndingDate.toISOString().slice(0, 10),
      revenueCents: metricKeys.map(() => 0),
      paidDate: paidEntry?.paidDate?.toISOString().slice(0, 10) ?? "",
      commissionEntryId: paidEntry?.id,
      updatedAt: paidEntry?.updatedAt.toISOString(),
    };
    const metricIndex = metricKeys.indexOf(value.metricKey);
    if (metricIndex >= 0) row.revenueCents[metricIndex] = value.value ?? 0;
    rowByWeek.set(weekStart, row);
  }

  return [...rowByWeek.values()];
}

export default async function CommissionsPage() {
  await requireSuperAdmin();

  const [trainingValues, groomingValues, rebeccaPaidDates, gabrielaPaidDates] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: {
        segment: KpiSegment.TRAINING,
        metricKey: { in: [...REBECCA_METRICS] },
      },
      orderBy: { weekStart: "desc" },
    }),
    prisma.kpiWeeklyValue.findMany({
      where: {
        segment: KpiSegment.IN_HOUSE_GROOMING,
        metricKey: { in: [...GABRIELA_METRICS] },
      },
      orderBy: { weekStart: "desc" },
    }),
    prisma.financeEmployeeCommission.findMany({
      where: { employeeName: "Rebecca", businessSegment: KpiSegment.TRAINING },
    }),
    prisma.financeEmployeeCommission.findMany({
      where: {
        employeeName: "Gabriela",
        businessSegment: KpiSegment.IN_HOUSE_GROOMING,
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PayrollSubnav active="commissions" />

      <div>
        <h2 className="text-xl font-semibold text-gray-900">Commissions</h2>
        <p className="mt-1 text-gray-500">Employee commission reporting and calculations</p>
      </div>

      <CommissionsLedger
        rebeccaRows={buildCommissionRows(trainingValues, REBECCA_METRICS, rebeccaPaidDates)}
        gabrielaRows={buildCommissionRows(groomingValues, GABRIELA_METRICS, gabrielaPaidDates)}
      />
    </div>
  );
}
