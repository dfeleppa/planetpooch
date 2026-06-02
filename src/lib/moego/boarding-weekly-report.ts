import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addWeeks, fromWeekParam, toWeekParam, weekStartOf } from "@/lib/week";
import {
  streamAppointments,
  streamOrders,
  toCents,
  type MoegoAppointmentRow,
  type MoegoAppointmentServiceDetail,
} from "@/lib/moego/client";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { PET_RESORT_BUSINESS_ID } from "@/lib/moego/daycare-weekly-report";

const BOARDING_KPI_METRICS = {
  revenue: "revenue",
  peakCapacity: "peak_capacity",
  offPeakCapacity: "off_peak_capacity",
  upsells: "upsells",
} as const;

const BOARDING_SERVICE_NAMES = [
  "classic group play",
  "classic 1 on 1",
  "express a group play",
  "express a 1 on 1",
  "express b group play",
  "express b 1 on 1",
  "full day daycare",
  "full day enrichment activity",
  "half day daycare",
  "luxury group play",
  "luxury 1 on 1",
  "xl group play",
  "xl 1 on 1",
] as const;

const BOARDING_SERVICE_NAME_SET = new Set<string>(BOARDING_SERVICE_NAMES);

export type WeeklyBoardingReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalFinishedBoardingAppointments: number;
  totalRevenueCents: number;
  peakCapacity: number;
  offPeakCapacity: number;
  upsellsCents: number;
};

export type WeeklyBoardingKpiValues = {
  weekStart: string;
  totalRevenueCents: number;
  peakCapacity: number;
  offPeakCapacity: number;
  upsellsCents: number;
};

function moneyValue(cents: number): number {
  return Math.round(cents);
}

function numberValue(value: number): number {
  return Math.round(value * 100);
}

function serviceLines(appointment: MoegoAppointmentRow): MoegoAppointmentServiceDetail[] {
  return (appointment.petServiceDetails ?? []).flatMap(
    (petService) => petService.serviceDetails ?? []
  );
}

function normalizeServiceName(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, " ")
    .replace(/[/&(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoardingService(service: MoegoAppointmentServiceDetail): boolean {
  const name = normalizeServiceName(service.name);
  const category = (service.category ?? "").toLowerCase();
  if (BOARDING_SERVICE_NAME_SET.has(name)) return true;

  return (
    name.includes("boarding") ||
    name.includes("board") ||
    category.includes("boarding") ||
    category.includes("board")
  );
}

function isOffPeakBoardingService(service: MoegoAppointmentServiceDetail): boolean {
  const normalized = normalizeServiceName(service.name);
  return (
    normalized.includes("off peak") ||
    normalized.includes("off-peak") ||
    normalized.includes("offpeak")
  );
}

function isPeakBoardingService(service: MoegoAppointmentServiceDetail): boolean {
  if (isOffPeakBoardingService(service)) return false;
  const normalized = normalizeServiceName(service.name);
  return normalized.includes("peak");
}

function netLineCents(
  lineGrossCents: number,
  appointmentGrossCents: number,
  order?: {
    subTotalCents: number;
    discountCents: number;
    status?: string;
  }
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

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysInWindow(
  appointment: MoegoAppointmentRow,
  weekStart: Date,
  weekEnd: Date
): number {
  const start = parseDate(appointment.duration?.startTime) ?? parseDate(appointment.checkInTime);
  const end = parseDate(appointment.duration?.endTime) ?? parseDate(appointment.checkOutTime);
  if (!start || !end) return 1;

  const overlapStart = Math.max(start.getTime(), weekStart.getTime());
  const overlapEnd = Math.min(end.getTime(), weekEnd.getTime());
  if (!(Number.isFinite(overlapStart) && Number.isFinite(overlapEnd)) || overlapEnd <= overlapStart) {
    return 1;
  }

  const ms = overlapEnd - overlapStart;
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil(ms / oneDay));
}

function previousCompletedWeek(today = new Date()): {
  start: Date;
  end: Date;
} {
  const currentStart = weekStartOf(today);
  const start = addWeeks(currentStart, -1);
  const end = addWeeks(start, 1);
  return { start, end };
}

async function listFinishedBoardingAppointments(
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
): Promise<Map<string, { subTotalCents: number; discountCents: number; status?: string }>> {
  if (orderIds.length === 0) return new Map();

  const wanted = new Set(orderIds);
  const found = new Map<string, { subTotalCents: number; discountCents: number; status?: string }>();
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

export async function buildWeeklyBoardingReport(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyBoardingReport> {
  const start = options?.weekStart
    ? fromWeekParam(options.weekStart)
    : previousCompletedWeek(options?.today).start;
  const end = addWeeks(start, 1);
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;

  const appointments = await listFinishedBoardingAppointments(start, end, businessId);
  const orderIds = [
    ...new Set(
      appointments
        .map((appointment) => appointment.orderId)
        .filter((orderId): orderId is string => Boolean(orderId))
    ),
  ];
  const orderMoney = await ordersById(orderIds, start, end, businessId);

  let peakCapacity = 0;
  let offPeakCapacity = 0;
  let upsellsCents = 0;
  let totalRevenueCents = 0;

  for (const appointment of appointments) {
    const lines = serviceLines(appointment);
    const appointmentGrossCents = lines.reduce(
      (sum, service) => sum + toCents(service.price),
      0
    );
    const order = appointment.orderId ? orderMoney.get(appointment.orderId) : undefined;
    const capacityUnits = daysInWindow(appointment, start, end);

    for (const service of lines) {
      const netCents = netLineCents(toCents(service.price), appointmentGrossCents, order);
      if (netCents > 0 && isBoardingService(service)) {
        totalRevenueCents += netCents;
      } else if (netCents > 0) {
        upsellsCents += netCents;
      }

      if (isBoardingService(service)) {
        if (isOffPeakBoardingService(service)) {
          offPeakCapacity += capacityUnits;
        } else if (isPeakBoardingService(service)) {
          peakCapacity += capacityUnits;
        } else {
          peakCapacity += capacityUnits;
        }
      }
    }
  }

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedBoardingAppointments: appointments.length,
    totalRevenueCents,
    peakCapacity,
    offPeakCapacity,
    upsellsCents,
  };
}

export async function upsertWeeklyBoardingKpis(
  values: WeeklyBoardingKpiValues
): Promise<void> {
  const weekStart = new Date(`${values.weekStart}T00:00:00.000Z`);
  const rows = [
    {
      metricKey: BOARDING_KPI_METRICS.revenue,
      value: moneyValue(values.totalRevenueCents),
    },
    {
      metricKey: BOARDING_KPI_METRICS.peakCapacity,
      value: numberValue(values.peakCapacity),
    },
    {
      metricKey: BOARDING_KPI_METRICS.offPeakCapacity,
      value: numberValue(values.offPeakCapacity),
    },
    {
      metricKey: BOARDING_KPI_METRICS.upsells,
      value: moneyValue(values.upsellsCents),
    },
  ];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: KpiSegment.BOARDING,
            weekStart,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value },
        create: {
          segment: KpiSegment.BOARDING,
          weekStart,
          metricKey: row.metricKey,
          value: row.value,
        },
      })
    ) satisfies Prisma.PrismaPromise<unknown>[]
  );
}

export async function syncWeeklyBoardingKpis(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyBoardingReport> {
  const report = await buildWeeklyBoardingReport(options);
  await upsertWeeklyBoardingKpis({
    weekStart: report.weekStart,
    totalRevenueCents: report.totalRevenueCents,
    peakCapacity: report.peakCapacity,
    offPeakCapacity: report.offPeakCapacity,
    upsellsCents: report.upsellsCents,
  });

  return report;
}
