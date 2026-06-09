import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addWeeks, fromWeekParam, toWeekParam, weekStartOf } from "@/lib/week";
import {
  streamAppointments,
  toCents,
  type MoegoAppointmentRow,
} from "@/lib/moego/client";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";

export const PET_RESORT_BUSINESS_ID = "biz3pcO";

const TRAINING_FREE_SERVICE = normalizeServiceName("Training $0");
const FREE_FIRST_DAY_SERVICE = normalizeServiceName("Free first day");
const HALF_DAY_DAYCARE_SERVICE = normalizeServiceName("Half day daycare");
const FULL_DAY_DAYCARE_SERVICE = normalizeServiceName("Full day daycare");
const DAYCARE_EVALUATION_NAME = normalizeServiceName("Evaluation");
const FULL_DAY_ENRICHMENT_ACTIVITY_SERVICE =
  normalizeServiceName("Full day enrichment activity");
const HALF_DAY_ENRICHMENT_ACTIVITY_SERVICE =
  normalizeServiceName("Half day enrichment activity");
const ALLOWED_DAYCARE_REVENUE_SERVICES = new Set([
  FULL_DAY_DAYCARE_SERVICE.toLowerCase(),
  HALF_DAY_DAYCARE_SERVICE.toLowerCase(),
  FULL_DAY_ENRICHMENT_ACTIVITY_SERVICE.toLowerCase(),
  HALF_DAY_ENRICHMENT_ACTIVITY_SERVICE.toLowerCase(),
]);
const DAYCARE_KPI_METRICS = {
  totalDaycareAppointments: "total_daycare_appointments",
  fullDayDaycare: "total_appointments",
  halfDayDaycare: "half_day_daycare",
  fullDayEnrichmentActivity: "full_day_enrichment_activity",
  halfDayEnrichmentActivity: "half_day_enrichment_activity",
  avgDailyOccupancy: "avg_daily_occupancy",
  evaluations: "evaluations",
  uniqueClients: "unique_clients",
  avgVisits: "avg_visits",
  totalNetSales: "total_net_sales",
} as const;

function normalizeServiceName(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, " ")
    .replace(/[/&(),$]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedServiceNames(appointment: MoegoAppointmentRow): string[] {
  return (appointment.petServiceDetails ?? [])
    .flatMap((petService) => petService.serviceDetails ?? [])
    .map((service) => normalizeServiceName(service.name))
    .filter((name): name is string => Boolean(name));
}

export type WeeklyDaycareServiceReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalFinishedAppointments: number;
  totalDaycareAppointments: number;
  totalNonTrainingAppointments: number;
  fullDayDaycareAppointments: number;
  halfDayDaycareAppointments: number;
  fullDayEnrichmentActivityAppointments: number;
  halfDayEnrichmentActivityAppointments: number;
  averageDailyOccupancy: number;
  evaluations: number;
  uniqueClients: number;
  averageVisitsPerClient: number;
  totalNetSalesCents: number;
  serviceCounts: Record<string, number>;
  trainingOnlyClientIds: string[];
  mixedTrainingClientIds: string[];
};

export type WeeklyDaycareKpiValues = {
  weekStart: string;
  totalDaycareAppointments?: number;
  totalNonTrainingAppointments?: number;
  fullDayDaycareAppointments?: number;
  halfDayDaycareAppointments?: number;
  fullDayEnrichmentActivityAppointments?: number;
  halfDayEnrichmentActivityAppointments?: number;
  averageDailyOccupancy?: number;
  evaluations?: number;
  uniqueClients: number;
  averageVisitsPerClient: number;
  totalNetSalesCents: number;
};

function moneyValue(value: number): number {
  return Math.round(value * 100);
}

function numberValue(value: number): number {
  return Math.round(value * 100);
}

function serviceNames(appointment: MoegoAppointmentRow): string[] {
  return (appointment.petServiceDetails ?? [])
    .flatMap((petService) => petService.serviceDetails ?? [])
    .map((service) => service.name?.trim())
    .filter((name): name is string => Boolean(name));
}

function serviceKey(appointment: MoegoAppointmentRow): string {
  return serviceNames(appointment).join(",") || "(no service)";
}

function hasTrainingFreeService(appointment: MoegoAppointmentRow): boolean {
  const names = normalizedServiceNames(appointment);
  return names.includes(TRAINING_FREE_SERVICE);
}

function hasFreeFirstDayService(appointment: MoegoAppointmentRow): boolean {
  const names = normalizedServiceNames(appointment);
  return names.includes(FREE_FIRST_DAY_SERVICE);
}

function hasHalfDayDaycareService(appointment: MoegoAppointmentRow): boolean {
  const names = normalizedServiceNames(appointment);
  return names.includes(HALF_DAY_DAYCARE_SERVICE);
}

function hasFullDayEnrichmentActivityService(appointment: MoegoAppointmentRow): boolean {
  const names = normalizedServiceNames(appointment);
  return names.includes(FULL_DAY_ENRICHMENT_ACTIVITY_SERVICE);
}

function hasHalfDayEnrichmentActivityService(appointment: MoegoAppointmentRow): boolean {
  const names = normalizedServiceNames(appointment);
  return names.includes(HALF_DAY_ENRICHMENT_ACTIVITY_SERVICE);
}

function hasFullDayDaycareService(appointment: MoegoAppointmentRow): boolean {
  const names = normalizedServiceNames(appointment);
  return names.includes(FULL_DAY_DAYCARE_SERVICE);
}

function hasTrackedDaycareAppointmentService(
  appointment: MoegoAppointmentRow
): boolean {
  const names = normalizedServiceNames(appointment);
  return names.some((name) => ALLOWED_DAYCARE_REVENUE_SERVICES.has(name));
}

function hasAllowedDaycareNetSalesService(appointment: MoegoAppointmentRow): boolean {
  return hasTrackedDaycareAppointmentService(appointment);
}

function isPaidDaycareRevenueAppointment(
  appointment: MoegoAppointmentRow
): boolean {
  return (
    !hasTrainingFreeService(appointment) &&
    !hasFreeFirstDayService(appointment) &&
    hasAllowedDaycareNetSalesService(appointment)
  );
}

function fallbackAppointmentNetCents(appointment: MoegoAppointmentRow): number {
  const serviceTotal = (appointment.petServiceDetails ?? [])
    .flatMap((petService) => petService.serviceDetails ?? [])
    .reduce((sum, service) => sum + toCents(service.price), 0);
  if (serviceTotal > 0) return serviceTotal;
  return toCents(appointment.totalAmount);
}

export function previousCompletedWeek(today = new Date()): {
  start: Date;
  end: Date;
} {
  const currentStart = weekStartOf(today);
  const start = addWeeks(currentStart, -1);
  const end = addWeeks(start, 1);
  return { start, end };
}

async function listDaycareAppointments(
  start: Date,
  end: Date,
  businessId: string
): Promise<MoegoAppointmentRow[]> {
  const appointments: MoegoAppointmentRow[] = [];
  for await (const page of streamAppointments(
    {
      startTime: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      serviceTypes: ["DAYCARE"],
    },
    [businessId]
  )) {
    appointments.push(...page);
  }
  return appointments;
}

async function listAppointmentsForEvaluations(
  start: Date,
  end: Date,
  businessId: string
): Promise<MoegoAppointmentRow[]> {
  const appointments: MoegoAppointmentRow[] = [];
  for await (const page of streamAppointments(
    {
      startTime: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    },
    [businessId]
  )) {
    appointments.push(...page);
  }
  return appointments;
}

function countEvaluations(appointments: MoegoAppointmentRow[]): number {
  return appointments
    .filter((appointment) => appointment.status !== "CANCELED")
    .reduce((sum, appointment) => {
      return (
        sum +
        (appointment.petServiceDetails ?? []).reduce((petSum, petService) => {
          const daycareEvaluations = (petService.evaluationDetails ?? []).filter(
            (evaluation) => normalizeServiceName(evaluation.name) === DAYCARE_EVALUATION_NAME
          );
          return petSum + daycareEvaluations.length;
        }, 0)
      );
    }, 0);
}

async function netSalesByOrderId(
  orderIds: string[]
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();

  const rows = await prisma.moegoOrder.findMany({
    where: {
      moegoId: { in: orderIds },
      status: { in: [...REVENUE_ORDER_STATUSES] },
    },
    select: {
      moegoId: true,
      subTotalCents: true,
      discountCents: true,
    },
  });

  return new Map(
    rows.map((order) => [
      order.moegoId,
      order.subTotalCents - order.discountCents,
    ])
  );
}

export async function buildWeeklyDaycareServiceReport(options?: {
  today?: Date;
  weekStart?: string;
  businessId?: string;
}): Promise<WeeklyDaycareServiceReport> {
  const start = options?.weekStart
    ? fromWeekParam(options.weekStart)
    : previousCompletedWeek(options?.today).start;
  const end = addWeeks(start, 1);
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;
  const [allDaycareAppointments, evaluationAppointments] = await Promise.all([
    listDaycareAppointments(start, end, businessId),
    listAppointmentsForEvaluations(start, end, businessId),
  ]);
  const appointments = allDaycareAppointments.filter(
    (appointment) => appointment.status === "FINISHED"
  );

  const fullDayDaycareAppointments = appointments.filter((appointment) => {
    return hasFullDayDaycareService(appointment);
  }).length;
  const halfDayDaycareAppointments = appointments.filter((appointment) => {
    return hasHalfDayDaycareService(appointment);
  }).length;
  const fullDayEnrichmentActivityAppointments = appointments.filter((appointment) => {
    return hasFullDayEnrichmentActivityService(appointment);
  }).length;
  const halfDayEnrichmentActivityAppointments = appointments.filter((appointment) => {
    return hasHalfDayEnrichmentActivityService(appointment);
  }).length;
  const trackedDaycareAppointments = appointments.filter((appointment) => {
    return (
      !hasTrainingFreeService(appointment) &&
      !hasFreeFirstDayService(appointment) &&
      hasTrackedDaycareAppointmentService(appointment)
    );
  });
  const revenueAppointments = appointments.filter((appointment) => {
    return isPaidDaycareRevenueAppointment(appointment);
  });
  const orderIds = revenueAppointments
    .map((appointment) => appointment.orderId)
    .filter((orderId): orderId is string => Boolean(orderId));
  const orderNetSales = await netSalesByOrderId([...new Set(orderIds)]);

  const serviceCounts = new Map<string, number>();
  const clients = new Map<string, { training: number; nonTraining: number }>();
  let totalNetSalesCents = 0;

  for (const appointment of appointments) {
    const key = appointment.customerId ?? `appointment:${appointment.id}`;
    const client = clients.get(key) ?? { training: 0, nonTraining: 0 };
    const shouldCountNetSales = isPaidDaycareRevenueAppointment(appointment);
    const shouldCountDaycareVisit = trackedDaycareAppointments.includes(appointment);
    if (hasTrainingFreeService(appointment)) {
      client.training++;
      clients.set(key, client);
      continue;
    }
    if (hasFreeFirstDayService(appointment)) {
      clients.set(key, client);
      continue;
    }
    if (shouldCountNetSales) {
      const orderNet = appointment.orderId
        ? orderNetSales.get(appointment.orderId)
        : undefined;
      totalNetSalesCents += orderNet ?? fallbackAppointmentNetCents(appointment);
    }

    if (shouldCountDaycareVisit) {
      client.nonTraining++;
    }

    if (shouldCountNetSales) {
      const service = serviceKey(appointment);
      serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
    }

    clients.set(key, client);
  }

  const clientRows = [...clients.entries()];
  const uniqueClients = clientRows.filter(([, row]) => row.nonTraining > 0).length;
  const totalNonTrainingAppointments = fullDayDaycareAppointments;
  const daycareVisitAppointments =
    fullDayDaycareAppointments +
    halfDayDaycareAppointments +
    fullDayEnrichmentActivityAppointments +
    halfDayEnrichmentActivityAppointments;
  const averageVisitsPerClient =
    uniqueClients > 0 ? trackedDaycareAppointments.length / uniqueClients : 0;
  const averageDailyOccupancy = daycareVisitAppointments / 6;
  const evaluations = countEvaluations(evaluationAppointments);
  const totalDaycareAppointments = daycareVisitAppointments + evaluations;

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedAppointments: appointments.length,
    totalDaycareAppointments,
    totalNonTrainingAppointments,
    fullDayDaycareAppointments,
    halfDayDaycareAppointments,
    fullDayEnrichmentActivityAppointments,
    halfDayEnrichmentActivityAppointments,
    averageDailyOccupancy,
    evaluations,
    uniqueClients,
    averageVisitsPerClient,
    totalNetSalesCents,
    serviceCounts: Object.fromEntries(
      [...serviceCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
    trainingOnlyClientIds: clientRows
      .filter(([, row]) => row.nonTraining === 0 && row.training > 0)
      .map(([clientId]) => clientId)
      .sort(),
    mixedTrainingClientIds: clientRows
      .filter(([, row]) => row.nonTraining > 0 && row.training > 0)
      .map(([clientId]) => clientId)
      .sort(),
  };
}

export async function upsertWeeklyDaycareKpis(
  values: WeeklyDaycareKpiValues
): Promise<void> {
  const weekStart = new Date(`${values.weekStart}T00:00:00.000Z`);
  const fullDayDaycareAppointments =
    values.fullDayDaycareAppointments ?? values.totalNonTrainingAppointments ?? 0;
  const halfDayDaycareAppointments = values.halfDayDaycareAppointments ?? 0;
  const fullDayEnrichmentActivityAppointments =
    values.fullDayEnrichmentActivityAppointments ?? 0;
  const halfDayEnrichmentActivityAppointments =
    values.halfDayEnrichmentActivityAppointments ?? 0;
  const evaluations = values.evaluations ?? 0;
  const daycareVisitAppointments =
    fullDayDaycareAppointments +
    halfDayDaycareAppointments +
    fullDayEnrichmentActivityAppointments +
    halfDayEnrichmentActivityAppointments;
  const totalDaycareAppointments =
    values.totalDaycareAppointments ?? daycareVisitAppointments + evaluations;
  const rows = [
    {
      metricKey: DAYCARE_KPI_METRICS.totalDaycareAppointments,
      value: numberValue(totalDaycareAppointments),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.fullDayDaycare,
      value: numberValue(fullDayDaycareAppointments),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.halfDayDaycare,
      value: numberValue(halfDayDaycareAppointments),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.fullDayEnrichmentActivity,
      value: numberValue(fullDayEnrichmentActivityAppointments),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.halfDayEnrichmentActivity,
      value: numberValue(halfDayEnrichmentActivityAppointments),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.avgDailyOccupancy,
      value: numberValue(
        values.averageDailyOccupancy ?? daycareVisitAppointments / 6
      ),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.evaluations,
      value: numberValue(evaluations),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.uniqueClients,
      value: numberValue(values.uniqueClients),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.avgVisits,
      value: numberValue(values.averageVisitsPerClient),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.totalNetSales,
      value: moneyValue(values.totalNetSalesCents / 100),
    },
  ];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: KpiSegment.DAYCARE,
            weekStart,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value },
        create: {
          segment: KpiSegment.DAYCARE,
          weekStart,
          metricKey: row.metricKey,
          value: row.value,
        },
      })
    ) satisfies Prisma.PrismaPromise<unknown>[]
  );
}

export async function syncWeeklyDaycareServiceKpis(options?: {
  today?: Date;
  weekStart?: string;
  businessId?: string;
}): Promise<WeeklyDaycareServiceReport> {
  const report = await buildWeeklyDaycareServiceReport(options);

  await upsertWeeklyDaycareKpis({
    weekStart: report.weekStart,
    totalDaycareAppointments: report.totalDaycareAppointments,
    totalNonTrainingAppointments: report.totalNonTrainingAppointments,
    fullDayDaycareAppointments: report.fullDayDaycareAppointments,
    halfDayDaycareAppointments: report.halfDayDaycareAppointments,
    fullDayEnrichmentActivityAppointments: report.fullDayEnrichmentActivityAppointments,
    halfDayEnrichmentActivityAppointments: report.halfDayEnrichmentActivityAppointments,
    averageDailyOccupancy: report.averageDailyOccupancy,
    evaluations: report.evaluations,
    uniqueClients: report.uniqueClients,
    averageVisitsPerClient: report.averageVisitsPerClient,
    totalNetSalesCents: report.totalNetSalesCents,
  });

  return report;
}
