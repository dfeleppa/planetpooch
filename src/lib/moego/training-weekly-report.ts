import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addWeeks, fromWeekParam, toWeekParam } from "@/lib/week";
import {
  streamAppointments,
  streamOrders,
  toCents,
  type MoegoAppointmentRow,
  type MoegoAppointmentServiceDetail,
} from "@/lib/moego/client";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { PET_RESORT_BUSINESS_ID, previousCompletedWeek } from "@/lib/moego/daycare-weekly-report";

const TRAINING_KPI_METRICS = {
  productSales: "product_sales",
  groupRevenue: "group_revenue",
  oneOnOneRevenue: "one_on_one_revenue",
  trainingEvaluations: "training_evaluations",
} as const;

const TRAINING_EVALUATION_NAME = normalizeServiceName("Training Evaluation");
const TRAINING_PRODUCT_NAMES = new Set([normalizeServiceName("Training Treat Pouch")]);
const SALES_DATE_CANDIDATE_LOOKBACK_WEEKS = 26;
const SALES_DATE_CANDIDATE_LOOKAHEAD_WEEKS = 52;

export type WeeklyTrainingReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalFinishedTrainingAppointments: number;
  trainingAppointmentsInSalesWindow: number;
  trainingEvaluations: number;
  productSalesCents: number;
  groupRevenueCents: number;
  oneOnOneRevenueCents: number;
  ordersInSalesWindow: number;
  appointmentsMissingOrder: number;
  appointmentsMissingSalesDatetime: number;
  serviceCounts: Record<string, number>;
};

export type WeeklyTrainingKpiValues = {
  weekStart: string;
  productSalesCents: number;
  groupRevenueCents: number;
  oneOnOneRevenueCents: number;
  trainingEvaluations?: number;
};

const GROUP_CLASS_KEYWORDS = [
  "akc canine good citizen program",
  "akc canine good citizen test only",
  "adolescent",
  "adult",
  "advanced",
  "intermediate",
  "puppy",
] as const;

const DIRECT_GROUP_TRAINING_ORDER_TITLES = new Set<string>(GROUP_CLASS_KEYWORDS);

type OrderMoney = {
  id?: string;
  title?: string;
  subTotalCents: number;
  discountCents: number;
  status?: string;
  salesDatetime?: string;
};

function moneyValue(cents: number): number {
  return Math.round(cents);
}

function serviceDetails(appointment: MoegoAppointmentRow): MoegoAppointmentServiceDetail[] {
  return (appointment.petServiceDetails ?? []).flatMap(
    (petService) => petService.serviceDetails ?? []
  );
}

function normalizeServiceName(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, " ")
    .replace(/[/&(),$]/g, " ")
    .replace(/['’]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countTrainingEvaluations(appointments: MoegoAppointmentRow[]): number {
  return appointments.reduce((sum, appointment) => {
    return (
      sum +
      (appointment.petServiceDetails ?? []).reduce((petSum, petService) => {
        const trainingEvaluations = (petService.evaluationDetails ?? []).filter(
          (evaluation) => normalizeServiceName(evaluation.name) === TRAINING_EVALUATION_NAME
        );
        return petSum + trainingEvaluations.length;
      }, 0)
    );
  }, 0);
}

function isTrainingService(service: MoegoAppointmentServiceDetail): boolean {
  const category = (service.category ?? "").toLowerCase();
  const name = normalizeServiceName(service.name);
  return category.includes("training") || name.includes("training");
}

function isGroupTrainingService(service: MoegoAppointmentServiceDetail): boolean {
  const name = normalizeServiceName(service.name);
  if (/(^|\s)group(\s+class| class| play| lesson| session)\b/.test(name)) return true;
  if (/(^|\s)training class\b/.test(name)) return true;

  return (
    /\bakc\b/.test(name) &&
    /\bgood\s*citizen\b/.test(name)
  ) || (
    /\b(group|class|training)\b/.test(name) &&
    /\b(adolescent|adult|advanced|intermediate|puppy)\b/.test(name)
  ) || (
    /\b(group|class|training)\b/.test(name) &&
    /\bakc\b/.test(name) &&
    /\b(canine|good\s*citizen)\b/.test(name)
  ) || GROUP_CLASS_KEYWORDS.some((word) => {
    if (!name.includes(word)) return false;
    return /\b(group|class|training)\b/.test(name);
  });
}

function isOneOnOneTrainingService(service: MoegoAppointmentServiceDetail): boolean {
  const name = normalizeServiceName(service.name);
  return (
    /\b1\s*on\s*1\b/.test(name) ||
    /\b1\s*:\s*1\b/.test(name) ||
    /\bone[-\s]?on[-\s]?one\b/.test(name) ||
    /\bone-?on-?one\b/.test(name) ||
    (/training/.test(name) && /\baddon\b/.test(name))
  );
}

function isDirectGroupTrainingOrder(order: OrderMoney): boolean {
  const title = normalizeServiceName(order.title);
  return DIRECT_GROUP_TRAINING_ORDER_TITLES.has(title);
}

function isDirectOneOnOneTrainingOrder(order: OrderMoney): boolean {
  const title = normalizeServiceName(order.title);
  return title.includes("training") && isOneOnOneTrainingService({ name: order.title });
}

function isTrainingProductOrder(order: OrderMoney): boolean {
  const title = normalizeServiceName(order.title);
  return [...TRAINING_PRODUCT_NAMES].some((productName) => title.includes(productName));
}

function addCount(counts: Map<string, number>, name: string | undefined) {
  const key = name?.trim() || "(unnamed)";
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function orderNetSalesCents(order: OrderMoney): number {
  return Math.max(0, order.subTotalCents - order.discountCents);
}

function isRevenueOrder(order: OrderMoney | undefined): order is OrderMoney {
  if (
    !order ||
    !REVENUE_ORDER_STATUSES.includes(
      order.status as (typeof REVENUE_ORDER_STATUSES)[number]
    )
  ) {
    return false;
  }
  return true;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSalesDatetimeInWindow(
  order: OrderMoney | undefined,
  start: Date,
  end: Date
): order is OrderMoney {
  if (!isRevenueOrder(order)) return false;
  const salesDatetime = parseDate(order.salesDatetime);
  return Boolean(salesDatetime && salesDatetime >= start && salesDatetime < end);
}

async function listFinishedAppointments(
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
      statuses: ["FINISHED"],
    },
    [businessId]
  )) {
    appointments.push(...page);
  }
  return appointments;
}

function uniqueAppointments(appointments: MoegoAppointmentRow[]): MoegoAppointmentRow[] {
  return [...new Map(appointments.map((appointment) => [appointment.id, appointment])).values()];
}

async function ordersById(
  orderIds: string[],
  businessId: string
): Promise<Map<string, OrderMoney>> {
  if (orderIds.length === 0) return new Map();

  const wanted = new Set(orderIds);
  const found = new Map<string, OrderMoney>();

  for await (const page of streamOrders(
    {
      ids: [...wanted],
    },
    [businessId]
  )) {
    for (const order of page) {
      if (!order.id || !wanted.has(order.id)) continue;
      found.set(order.id, {
        id: order.id,
        title: order.title,
        status: order.status,
        subTotalCents: toCents(order.subTotalAmount),
        discountCents: toCents(order.discountAmount),
        salesDatetime: order.salesDatetime,
      });
    }

    if (found.size === wanted.size) break;
  }

  return found;
}

async function listSalesCandidateOrders(
  start: Date,
  end: Date,
  businessId: string
): Promise<OrderMoney[]> {
  const orders: OrderMoney[] = [];

  for await (const page of streamOrders(
    {
      lastUpdatedTime: {
        startTime: start.toISOString(),
        endTime: addWeeks(end, SALES_DATE_CANDIDATE_LOOKAHEAD_WEEKS).toISOString(),
      },
    },
    [businessId]
  )) {
    for (const order of page) {
      orders.push({
        id: order.id,
        title: order.title,
        status: order.status,
        subTotalCents: toCents(order.subTotalAmount),
        discountCents: toCents(order.discountAmount),
        salesDatetime: order.salesDatetime,
      });
    }
  }

  return orders;
}

export async function buildWeeklyTrainingReport(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyTrainingReport> {
  const start = options?.weekStart
    ? fromWeekParam(options.weekStart)
    : previousCompletedWeek(options?.today).start;
  const end = addWeeks(start, 1);
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;
  const [weeklyAppointments, salesCandidateAppointments, salesCandidateOrders] = await Promise.all([
    listFinishedAppointments(start, end, businessId),
    listFinishedAppointments(
      addWeeks(start, -SALES_DATE_CANDIDATE_LOOKBACK_WEEKS),
      addWeeks(end, SALES_DATE_CANDIDATE_LOOKAHEAD_WEEKS),
      businessId
    ),
    listSalesCandidateOrders(start, end, businessId),
  ]);
  const trainingAppointments = weeklyAppointments.filter((appointment) =>
    serviceDetails(appointment).some(isTrainingService)
  );
  const trainingEvaluations = countTrainingEvaluations(weeklyAppointments);
  const trainingSalesCandidates = uniqueAppointments(salesCandidateAppointments).filter((appointment) =>
    serviceDetails(appointment).some(isTrainingService)
  );
  const orderIds = [
    ...new Set(
      trainingSalesCandidates
        .map((appointment) => appointment.orderId)
        .filter((orderId): orderId is string => Boolean(orderId))
    ),
  ];
  const orderMoney = await ordersById(orderIds, businessId);

  const serviceCounts = new Map<string, number>();
  let productSalesCents = 0;
  let groupRevenueCents = 0;
  let oneOnOneRevenueCents = 0;
  let appointmentsMissingSalesDatetime = 0;
  const countedOrderIds = new Set<string>();
  const trainingAppointmentsInSalesWindow = trainingSalesCandidates.filter((appointment) => {
    if (!appointment.orderId) return false;
    const order = orderMoney.get(appointment.orderId);
    if (!parseDate(order?.salesDatetime)) appointmentsMissingSalesDatetime++;
    return isSalesDatetimeInWindow(order, start, end);
  });

  for (const appointment of trainingAppointmentsInSalesWindow) {
    const lines = serviceDetails(appointment);
    const orderId = appointment.orderId;
    const order = orderId ? orderMoney.get(orderId) : undefined;
    const categorizedLines = lines
      .map((service) => ({
        service,
        grossCents: toCents(service.price),
        bucket: isGroupTrainingService(service)
          ? "group"
          : isOneOnOneTrainingService(service)
            ? "oneOnOne"
            : null,
      }))
      .filter((line) => isTrainingService(line.service) && line.bucket);
    const categorizedGrossCents = categorizedLines.reduce(
      (sum, line) => sum + line.grossCents,
      0
    );
    const shouldCountRevenue =
      Boolean(orderId) &&
      Boolean(order) &&
      categorizedLines.length > 0 &&
      (orderId ? !countedOrderIds.has(orderId) : false);

    for (const service of lines) {
      if (!isTrainingService(service)) continue;
      addCount(serviceCounts, service.name);
    }

    if (shouldCountRevenue && orderId && order) {
      const orderNetCents = orderNetSalesCents(order);
      for (const line of categorizedLines) {
        const netCents =
          categorizedGrossCents > 0
            ? Math.round((line.grossCents / categorizedGrossCents) * orderNetCents)
            : Math.round(orderNetCents / categorizedLines.length);
        if (line.bucket === "group") {
          groupRevenueCents += netCents;
        } else if (line.bucket === "oneOnOne") {
          oneOnOneRevenueCents += netCents;
        }
      }
      if (orderNetCents > 0) countedOrderIds.add(orderId);
    }
  }

  for (const order of salesCandidateOrders) {
    if (!order.id || countedOrderIds.has(order.id)) continue;
    if (!isSalesDatetimeInWindow(order, start, end)) continue;

    const orderNetCents = orderNetSalesCents(order);
    if (orderNetCents <= 0) continue;

    if (isTrainingProductOrder(order)) {
      productSalesCents += orderNetCents;
      countedOrderIds.add(order.id);
      addCount(serviceCounts, order.title);
    } else if (isDirectGroupTrainingOrder(order)) {
      groupRevenueCents += orderNetCents;
      countedOrderIds.add(order.id);
      addCount(serviceCounts, order.title);
    } else if (isDirectOneOnOneTrainingOrder(order)) {
      oneOnOneRevenueCents += orderNetCents;
      countedOrderIds.add(order.id);
      addCount(serviceCounts, order.title);
    }
  }

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedTrainingAppointments: trainingAppointments.length,
    trainingAppointmentsInSalesWindow: trainingAppointmentsInSalesWindow.length,
    trainingEvaluations,
    productSalesCents,
    groupRevenueCents,
    oneOnOneRevenueCents,
    ordersInSalesWindow: countedOrderIds.size,
    appointmentsMissingOrder: trainingAppointments.filter(
      (appointment) => !appointment.orderId
    ).length,
    appointmentsMissingSalesDatetime,
    serviceCounts: Object.fromEntries(
      [...serviceCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

export async function upsertWeeklyTrainingKpis(
  values: WeeklyTrainingKpiValues
): Promise<void> {
  const weekStart = new Date(`${values.weekStart}T00:00:00.000Z`);
  const rows = [
    {
      metricKey: TRAINING_KPI_METRICS.productSales,
      value: moneyValue(values.productSalesCents),
    },
    {
      metricKey: TRAINING_KPI_METRICS.groupRevenue,
      value: moneyValue(values.groupRevenueCents),
    },
    {
      metricKey: TRAINING_KPI_METRICS.oneOnOneRevenue,
      value: moneyValue(values.oneOnOneRevenueCents),
    },
    {
      metricKey: TRAINING_KPI_METRICS.trainingEvaluations,
      value: Math.round((values.trainingEvaluations ?? 0) * 100),
    },
  ];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: KpiSegment.TRAINING,
            weekStart,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value },
        create: {
          segment: KpiSegment.TRAINING,
          weekStart,
          metricKey: row.metricKey,
          value: row.value,
        },
      })
    ) satisfies Prisma.PrismaPromise<unknown>[]
  );
}

export async function syncWeeklyTrainingKpis(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyTrainingReport> {
  const report = await buildWeeklyTrainingReport(options);

  await upsertWeeklyTrainingKpis({
    weekStart: report.weekStart,
    productSalesCents: report.productSalesCents,
    groupRevenueCents: report.groupRevenueCents,
    oneOnOneRevenueCents: report.oneOnOneRevenueCents,
    trainingEvaluations: report.trainingEvaluations,
  });

  return report;
}
