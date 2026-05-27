import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addWeeks, toWeekParam, weekStartOf } from "@/lib/week";
import {
  streamAppointments,
  toCents,
  type MoegoAppointmentRow,
} from "@/lib/moego/client";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";

export const PET_RESORT_BUSINESS_ID = "biz3pcO";

const TRAINING_FREE_SERVICE = "Training $0";
const DAYCARE_KPI_METRICS = {
  totalAppointments: "total_appointments",
  uniqueClients: "unique_clients",
  avgVisits: "avg_visits",
  totalNetSales: "total_net_sales",
} as const;

export type WeeklyDaycareServiceReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalFinishedAppointments: number;
  totalNonTrainingAppointments: number;
  uniqueClients: number;
  averageVisitsPerClient: number;
  totalNetSalesCents: number;
  serviceCounts: Record<string, number>;
  trainingOnlyClientIds: string[];
  mixedTrainingClientIds: string[];
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

function isTrainingOnly(appointment: MoegoAppointmentRow): boolean {
  const names = serviceNames(appointment);
  return names.length > 0 && names.every((name) => name === TRAINING_FREE_SERVICE);
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

async function listFinishedDaycareAppointments(
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
      serviceTypes: ["DAYCARE"],
    },
    [businessId]
  )) {
    appointments.push(...page);
  }
  return appointments;
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
  businessId?: string;
}): Promise<WeeklyDaycareServiceReport> {
  const { start, end } = previousCompletedWeek(options?.today);
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;
  const appointments = await listFinishedDaycareAppointments(start, end, businessId);

  const nonTrainingAppointments = appointments.filter((appointment) => {
    return !isTrainingOnly(appointment);
  });
  const orderIds = nonTrainingAppointments
    .map((appointment) => appointment.orderId)
    .filter((orderId): orderId is string => Boolean(orderId));
  const orderNetSales = await netSalesByOrderId([...new Set(orderIds)]);

  const serviceCounts = new Map<string, number>();
  const clients = new Map<string, { training: number; nonTraining: number }>();
  let totalNetSalesCents = 0;

  for (const appointment of appointments) {
    const key = appointment.customerId ?? `appointment:${appointment.id}`;
    const client = clients.get(key) ?? { training: 0, nonTraining: 0 };
    if (isTrainingOnly(appointment)) {
      client.training++;
      clients.set(key, client);
      continue;
    }

    client.nonTraining++;
    clients.set(key, client);

    const service = serviceKey(appointment);
    serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);

    const orderNet = appointment.orderId
      ? orderNetSales.get(appointment.orderId)
      : undefined;
    totalNetSalesCents += orderNet ?? fallbackAppointmentNetCents(appointment);
  }

  const clientRows = [...clients.entries()];
  const uniqueClients = clientRows.filter(([, row]) => row.nonTraining > 0).length;
  const totalNonTrainingAppointments = nonTrainingAppointments.length;

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedAppointments: appointments.length,
    totalNonTrainingAppointments,
    uniqueClients,
    averageVisitsPerClient:
      uniqueClients > 0 ? totalNonTrainingAppointments / uniqueClients : 0,
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

export async function syncWeeklyDaycareServiceKpis(options?: {
  today?: Date;
  businessId?: string;
}): Promise<WeeklyDaycareServiceReport> {
  const report = await buildWeeklyDaycareServiceReport(options);
  const weekStart = new Date(`${report.weekStart}T00:00:00.000Z`);

  const rows = [
    {
      metricKey: DAYCARE_KPI_METRICS.totalAppointments,
      value: numberValue(report.totalNonTrainingAppointments),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.uniqueClients,
      value: numberValue(report.uniqueClients),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.avgVisits,
      value: numberValue(report.averageVisitsPerClient),
    },
    {
      metricKey: DAYCARE_KPI_METRICS.totalNetSales,
      value: moneyValue(report.totalNetSalesCents / 100),
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

  return report;
}
