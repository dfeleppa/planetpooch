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
  groomingAppointmentsInSalesWindow: number;
  totalPetsServiced: number;
  totalNetSalesCents: number;
  upsellsCents: number;
  ordersInSalesWindow: number;
  serviceCounts: Record<string, number>;
  addonCounts: Record<string, number>;
  appointmentsMissingOrder: number;
  appointmentsMissingSalesDatetime: number;
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
  salesDatetime?: string;
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

function normalizeServiceName(name: string | undefined): string {
  const normalized = (name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, " ")
    .replace(/[/&(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function isTrainingService(service: MoegoAppointmentServiceDetail): boolean {
  const category = service.category?.toLowerCase() ?? "";
  const name = service.name?.toLowerCase() ?? "";
  return category.includes("training") || name.includes("training");
}

function isGroomingLine(service: MoegoAppointmentServiceDetail): boolean {
  if (isTrainingService(service)) {
    return false;
  }

  return normalizeServiceName(service.name).includes("groom");
}

function isGroomingService(service: MoegoAppointmentServiceDetail): boolean {
  return isGroomingLine(service);
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
      if (!wanted.has(order.id)) continue;
      found.set(order.id, {
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
  const orderMoney = await ordersById(orderIds, businessId);

  const serviceCounts = new Map<string, number>();
  const addonCounts = new Map<string, number>();
  let totalNetSalesCents = 0;
  const upsellsCents = 0;
  const totalPetsServiced = new Set<string>();
  let appointmentsMissingSalesDatetime = 0;
  const countedOrderIds = new Set<string>();
  const groomingAppointmentsInSalesWindow = groomingAppointments.filter((appointment) => {
    if (!appointment.orderId) return false;
    const order = orderMoney.get(appointment.orderId);
    if (!parseDate(order?.salesDatetime)) appointmentsMissingSalesDatetime++;
    return isSalesDatetimeInWindow(order, start, end);
  });

  for (const appointment of groomingAppointmentsInSalesWindow) {
    const allLines = serviceDetails(appointment);
    const order = appointment.orderId
      ? orderMoney.get(appointment.orderId)
      : undefined;

    for (const petService of appointment.petServiceDetails ?? []) {
      if ((petService.serviceDetails ?? []).some(isGroomingService)) {
        const petId = petService.pet?.id ?? petService.pet?.name;
        totalPetsServiced.add(petId ?? appointment.id);
      }
    }

    for (const service of allLines) {
      if (isGroomingService(service)) {
        addCount(serviceCounts, service.name);
      }
    }

    if (
      appointment.orderId &&
      order &&
      !countedOrderIds.has(appointment.orderId)
    ) {
      totalNetSalesCents += orderNetSalesCents(order);
      countedOrderIds.add(appointment.orderId);
    }
  }

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedAppointments: appointments.length,
    groomingAppointments: groomingAppointments.length,
    groomingAppointmentsInSalesWindow: groomingAppointmentsInSalesWindow.length,
    totalPetsServiced: totalPetsServiced.size,
    totalNetSalesCents,
    upsellsCents,
    ordersInSalesWindow: countedOrderIds.size,
    serviceCounts: Object.fromEntries(
      [...serviceCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
    addonCounts: Object.fromEntries(
      [...addonCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
    appointmentsMissingOrder: groomingAppointments.filter(
      (appointment) => !appointment.orderId
    ).length,
    appointmentsMissingSalesDatetime,
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
