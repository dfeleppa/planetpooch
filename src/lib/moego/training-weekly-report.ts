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
} as const;

export type WeeklyTrainingReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalFinishedTrainingAppointments: number;
  groupRevenueCents: number;
  oneOnOneRevenueCents: number;
  serviceCounts: Record<string, number>;
};

export type WeeklyTrainingKpiValues = {
  weekStart: string;
  groupRevenueCents: number;
  oneOnOneRevenueCents: number;
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

type OrderMoney = {
  subTotalCents: number;
  discountCents: number;
  status?: string;
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

function addCount(counts: Map<string, number>, name: string | undefined) {
  const key = name?.trim() || "(unnamed)";
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function netLineCents(
  lineGrossCents: number,
  appointmentGrossCents: number,
  order?: OrderMoney
): number {
  if (
    !order ||
    !REVENUE_ORDER_STATUSES.includes(
      order.status as (typeof REVENUE_ORDER_STATUSES)[number]
    )
  ) {
    return lineGrossCents;
  }

  const baseGrossCents =
    appointmentGrossCents > 0 ? appointmentGrossCents : order.subTotalCents;
  if (baseGrossCents <= 0) return lineGrossCents;

  const discountShare = Math.round(
    (lineGrossCents / baseGrossCents) * order.discountCents
  );
  return Math.max(0, lineGrossCents - discountShare);
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

async function ordersById(
  orderIds: string[],
  start: Date,
  end: Date,
  businessId: string
): Promise<Map<string, OrderMoney>> {
  if (orderIds.length === 0) return new Map();

  const wanted = new Set(orderIds);
  const found = new Map<string, OrderMoney>();
  const lookupStart = addWeeks(start, -12);
  const lookupEnd = addWeeks(end, 12);

  for await (const page of streamOrders(
    {
      lastUpdatedTime: {
        startTime: lookupStart.toISOString(),
        endTime: lookupEnd.toISOString(),
      },
    },
    [businessId]
  )) {
    for (const order of page) {
      if (!order.id || !wanted.has(order.id)) continue;
      found.set(order.id, {
        status: order.status,
        subTotalCents: toCents(order.subTotalAmount),
        discountCents: toCents(order.discountAmount),
      });
    }

    if (found.size === wanted.size) break;
  }

  return found;
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
  const appointments = await listFinishedAppointments(start, end, businessId);
  const trainingAppointments = appointments.filter((appointment) =>
    serviceDetails(appointment).some(isTrainingService)
  );
  const orderIds = [
    ...new Set(
      trainingAppointments
        .map((appointment) => appointment.orderId)
        .filter((orderId): orderId is string => Boolean(orderId))
    ),
  ];
  const orderMoney = await ordersById(orderIds, start, end, businessId);

  const serviceCounts = new Map<string, number>();
  let groupRevenueCents = 0;
  let oneOnOneRevenueCents = 0;

  for (const appointment of trainingAppointments) {
    const lines = serviceDetails(appointment);
    const appointmentGrossCents = lines.reduce(
      (sum, service) => sum + toCents(service.price),
      0
    );
    const order = appointment.orderId ? orderMoney.get(appointment.orderId) : undefined;

    for (const service of lines) {
      if (!isTrainingService(service)) continue;

      const lineGrossCents = toCents(service.price);
      const netCents = netLineCents(lineGrossCents, appointmentGrossCents, order);
      addCount(serviceCounts, service.name);

      if (isGroupTrainingService(service)) {
        groupRevenueCents += netCents;
      } else if (isOneOnOneTrainingService(service)) {
        oneOnOneRevenueCents += netCents;
      } else {
        // Reserved for future service-classification expansion.
      }
    }
  }

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedTrainingAppointments: trainingAppointments.length,
    groupRevenueCents,
    oneOnOneRevenueCents,
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
      value: null,
    },
    {
      metricKey: TRAINING_KPI_METRICS.groupRevenue,
      value: moneyValue(values.groupRevenueCents),
    },
    {
      metricKey: TRAINING_KPI_METRICS.oneOnOneRevenue,
      value: moneyValue(values.oneOnOneRevenueCents),
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
    groupRevenueCents: report.groupRevenueCents,
    oneOnOneRevenueCents: report.oneOnOneRevenueCents,
  });

  return report;
}
