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
import { PET_RESORT_BUSINESS_ID, previousCompletedWeek } from "@/lib/moego/daycare-weekly-report";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";

const IN_HOUSE_GROOMING_KPI_METRICS = {
  revenue: "revenue",
  upsells: "upsells",
  totalPetsServiced: "total_pets_serviced",
} as const;

export type WeeklyInHouseGroomingReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalFinishedAppointments: number;
  groomingAppointments: number;
  totalPetsServiced: number;
  totalNetSalesCents: number;
  upsellsCents: number;
  serviceCounts: Record<string, number>;
  addonCounts: Record<string, number>;
  appointmentsMissingOrder: number;
};

export type WeeklyInHouseGroomingKpiValues = {
  weekStart: string;
  totalNetSalesCents: number;
  upsellsCents?: number;
  totalPetsServiced: number;
};

type OrderMoney = {
  subTotalCents: number;
  discountCents: number;
  status?: string;
};

function moneyValue(cents: number): number {
  return Math.round(cents);
}

function numberValue(value: number): number {
  return Math.round(value * 100);
}

function serviceDetails(appointment: MoegoAppointmentRow): MoegoAppointmentServiceDetail[] {
  return (appointment.petServiceDetails ?? []).flatMap(
    (petService) => petService.serviceDetails ?? []
  );
}

function isGroomingLine(service: MoegoAppointmentServiceDetail): boolean {
  const category = service.category?.toLowerCase() ?? "";
  const name = service.name?.toLowerCase() ?? "";
  const hasGroomText =
    category.includes("groom") || name.includes("groom") || name.includes("nail trim");

  return (
    hasGroomText ||
    (service.serviceItemType === "GROOMING" && service.serviceType === "SERVICE")
  );
}

function isNailTrimLine(service: MoegoAppointmentServiceDetail): boolean {
  const name = service.name?.toLowerCase() ?? "";
  return name.includes("nail trim");
}

function isGroomingService(service: MoegoAppointmentServiceDetail): boolean {
  return isGroomingLine(service) && !isNailTrimLine(service);
}

function isGroomingAddon(service: MoegoAppointmentServiceDetail): boolean {
  return isNailTrimLine(service) && isGroomingLine(service);
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
      if (!wanted.has(order.id)) continue;
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

export async function buildWeeklyInHouseGroomingReport(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyInHouseGroomingReport> {
  const start = options?.weekStart
    ? fromWeekParam(options.weekStart)
    : previousCompletedWeek(options?.today).start;
  const end = addWeeks(start, 1);
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;
  const appointments = await listFinishedAppointments(start, end, businessId);
  const groomingAppointments = appointments.filter((appointment) =>
    serviceDetails(appointment).some(isGroomingLine)
  );
  const orderIds = [
    ...new Set(
      groomingAppointments
        .map((appointment) => appointment.orderId)
        .filter((orderId): orderId is string => Boolean(orderId))
    ),
  ];
  const orderMoney = await ordersById(orderIds, start, end, businessId);

  const serviceCounts = new Map<string, number>();
  const addonCounts = new Map<string, number>();
  let totalNetSalesCents = 0;
  let upsellsCents = 0;
  const totalPetsServiced = new Set<string>();

  for (const appointment of groomingAppointments) {
    const allLines = serviceDetails(appointment);
    const appointmentGrossCents = allLines.reduce(
      (sum, service) => sum + toCents(service.price),
      0
    );
    const order = appointment.orderId
      ? orderMoney.get(appointment.orderId)
      : undefined;

    for (const petService of appointment.petServiceDetails ?? []) {
      if ((petService.serviceDetails ?? []).some(isGroomingService)) {
        const petId = petService.petId ?? petService.petName;
        totalPetsServiced.add(petId ?? appointment.id);
      }
    }

    for (const service of allLines) {
      const grossCents = toCents(service.price);
      const netCents = netLineCents(grossCents, appointmentGrossCents, order);

      if (isGroomingService(service)) {
        totalNetSalesCents += netCents;
        addCount(serviceCounts, service.name);
      } else if (isGroomingAddon(service)) {
        upsellsCents += netCents;
        addCount(addonCounts, service.name);
      }
    }
  }

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedAppointments: appointments.length,
    groomingAppointments: groomingAppointments.length,
    totalPetsServiced: totalPetsServiced.size,
    totalNetSalesCents,
    upsellsCents,
    serviceCounts: Object.fromEntries(
      [...serviceCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
    addonCounts: Object.fromEntries(
      [...addonCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
    appointmentsMissingOrder: groomingAppointments.filter(
      (appointment) => !appointment.orderId
    ).length,
  };
}

export async function upsertWeeklyInHouseGroomingKpis(
  values: WeeklyInHouseGroomingKpiValues
): Promise<void> {
  const weekStart = new Date(`${values.weekStart}T00:00:00.000Z`);
  const rows = [
    {
      metricKey: IN_HOUSE_GROOMING_KPI_METRICS.revenue,
      value: moneyValue(values.totalNetSalesCents),
    },
    {
      metricKey: IN_HOUSE_GROOMING_KPI_METRICS.upsells,
      value: moneyValue(values.upsellsCents ?? 0),
    },
    {
      metricKey: IN_HOUSE_GROOMING_KPI_METRICS.totalPetsServiced,
      value: numberValue(values.totalPetsServiced),
    },
  ];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: KpiSegment.IN_HOUSE_GROOMING,
            weekStart,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value },
        create: {
          segment: KpiSegment.IN_HOUSE_GROOMING,
          weekStart,
          metricKey: row.metricKey,
          value: row.value,
        },
      })
    ) satisfies Prisma.PrismaPromise<unknown>[]
  );
}

export async function syncWeeklyInHouseGroomingKpis(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyInHouseGroomingReport> {
  const report = await buildWeeklyInHouseGroomingReport(options);

  await upsertWeeklyInHouseGroomingKpis({
    weekStart: report.weekStart,
    totalNetSalesCents: report.totalNetSalesCents,
    upsellsCents: report.upsellsCents,
    totalPetsServiced: report.totalPetsServiced,
  });

  return report;
}
