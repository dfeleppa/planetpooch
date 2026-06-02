import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addWeeks, toWeekParam, fromWeekParam } from "@/lib/week";
import {
  streamAppointments,
  toCents,
  type MoegoAppointmentRow,
} from "@/lib/moego/client";

export const MOBILE_GROOMING_BUSINESS_ID = "bizVdfk";

const MOBILE_GROOMING_KPI_METRICS = {
  avgRebookRate: "avg_rebook_rate",
  clientsServiced: "clients_serviced",
  dogsServiced: "dogs_serviced",
  newClientsServiced: "new_clients_serviced",
  totalRevenue: "total_revenue",
} as const;

export type WeeklyMobileGroomingReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalAppointments: number;
  finishedAppointments: number;
  uniqueClients: number;
  newClientsServiced: number;
  dogsServiced: number;
  rebookedClients: number;
  rebookRatePercent: number;
  totalNetSalesCents: number;
  appointmentsMissingCustomerId: number;
  appointmentsMissingPetServiceDetails: number;
  futureAppointmentsChecked: number;
};

function moneyValue(cents: number): number {
  return Math.round(cents);
}

function numberValue(value: number): number {
  return Math.round(value * 100);
}

function percentValue(value: number): number {
  return Math.round(value * 100);
}

function petServiceDetails(appointment: MoegoAppointmentRow) {
  return appointment.petServiceDetails ?? [];
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function appointmentNetCents(appointment: MoegoAppointmentRow): number {
  const detailTotal = petServiceDetails(appointment)
    .flatMap((petService) => petService.serviceDetails ?? [])
    .reduce((sum, service) => sum + toCents(service.price), 0);

  if (detailTotal > 0) return detailTotal;
  return toCents(appointment.totalAmount);
}

async function listWeeklyAppointments(
  weekStart: Date,
  businessId: string
): Promise<MoegoAppointmentRow[]> {
  const weekEnd = addWeeks(weekStart, 1);
  const appointments: MoegoAppointmentRow[] = [];

  for await (const page of streamAppointments(
    {
      startTime: {
        startTime: weekStart.toISOString(),
        endTime: weekEnd.toISOString(),
      },
    },
    [businessId]
  )) {
    appointments.push(...page);
  }

  return appointments;
}

async function customerIdsWithAppointments(options: {
  businessId: string;
  customerIds: string[];
  start: Date;
  end: Date;
  statuses: string[];
}): Promise<{ customerIds: Set<string>; appointmentsChecked: number }> {
  const matchingCustomerIds = new Set<string>();
  let appointmentsChecked = 0;

  for await (const page of streamAppointments(
    {
      startTime: {
        startTime: options.start.toISOString(),
        endTime: options.end.toISOString(),
      },
      statuses: options.statuses,
      customerIds: options.customerIds,
    },
    [options.businessId]
  )) {
    appointmentsChecked += page.length;
    for (const appointment of page) {
      if (
        appointment.customerId &&
        options.customerIds.includes(appointment.customerId)
      ) {
        matchingCustomerIds.add(appointment.customerId);
      }
    }

    if (options.customerIds.every((id) => matchingCustomerIds.has(id))) break;
  }

  return { customerIds: matchingCustomerIds, appointmentsChecked };
}

async function priorFinishedCustomerIds(options: {
  weekStart: Date;
  businessId: string;
  customerIds: Set<string>;
}): Promise<Set<string>> {
  const priorCustomerIds = new Set<string>();
  if (options.customerIds.size === 0) return priorCustomerIds;

  const results = await Promise.all(
    chunks([...options.customerIds], 50).map((customerIds) =>
      customerIdsWithAppointments({
        businessId: options.businessId,
        customerIds,
        start: new Date("2000-01-01T00:00:00.000Z"),
        end: options.weekStart,
        statuses: ["FINISHED"],
      })
    )
  );

  for (const result of results) {
    for (const customerId of result.customerIds) {
      priorCustomerIds.add(customerId);
    }
  }

  return priorCustomerIds;
}

async function rebookSummary(options: {
  weekEnd: Date;
  businessId: string;
  customerIds: Set<string>;
}): Promise<{
  rebookedClients: number;
  futureAppointmentsChecked: number;
}> {
  if (options.customerIds.size === 0) {
    return { rebookedClients: 0, futureAppointmentsChecked: 0 };
  }

  const futureEnd = addWeeks(options.weekEnd, 104);
  const rebookedCustomerIds = new Set<string>();

  const results = await Promise.all(
    chunks([...options.customerIds], 50).map((customerIds) =>
      customerIdsWithAppointments({
        businessId: options.businessId,
        customerIds,
        start: options.weekEnd,
        end: futureEnd,
        statuses: ["CONFIRMED", "UNCONFIRMED", "FINISHED"],
      })
    )
  );

  let futureAppointmentsChecked = 0;
  for (const result of results) {
    futureAppointmentsChecked += result.appointmentsChecked;
    for (const customerId of result.customerIds) {
      rebookedCustomerIds.add(customerId);
    }
  }

  return {
    rebookedClients: rebookedCustomerIds.size,
    futureAppointmentsChecked,
  };
}

export async function buildWeeklyMobileGroomingReport(options: {
  weekStart: string;
  businessId?: string;
}): Promise<WeeklyMobileGroomingReport> {
  const weekStart = fromWeekParam(options.weekStart);
  const weekEnd = addWeeks(weekStart, 1);
  const businessId = options.businessId ?? MOBILE_GROOMING_BUSINESS_ID;
  const appointments = await listWeeklyAppointments(weekStart, businessId);
  const finishedAppointments = appointments.filter(
    (appointment) => appointment.status === "FINISHED"
  );

  const clientIds = new Set(
    finishedAppointments
      .map((appointment) => appointment.customerId)
      .filter((id): id is string => Boolean(id))
  );

  const dogsServiced = finishedAppointments.reduce((sum, appointment) => {
    return sum + petServiceDetails(appointment).length;
  }, 0);

  const totalNetSalesCents = finishedAppointments.reduce((sum, appointment) => {
    return sum + appointmentNetCents(appointment);
  }, 0);
  const priorCustomerIds = await priorFinishedCustomerIds({
    weekStart,
    businessId,
    customerIds: clientIds,
  });
  const newClientsServiced = [...clientIds].filter(
    (customerId) => !priorCustomerIds.has(customerId)
  ).length;
  const { rebookedClients, futureAppointmentsChecked } = await rebookSummary({
    weekEnd,
    businessId,
    customerIds: clientIds,
  });
  const rebookRatePercent =
    clientIds.size > 0 ? (rebookedClients / clientIds.size) * 100 : 0;

  return {
    weekStart: options.weekStart,
    weekEnd: toWeekParam(new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalAppointments: appointments.length,
    finishedAppointments: finishedAppointments.length,
    uniqueClients: clientIds.size,
    newClientsServiced,
    dogsServiced,
    rebookedClients,
    rebookRatePercent,
    totalNetSalesCents,
    appointmentsMissingCustomerId: finishedAppointments.filter(
      (appointment) => !appointment.customerId
    ).length,
    appointmentsMissingPetServiceDetails: finishedAppointments.filter(
      (appointment) => petServiceDetails(appointment).length === 0
    ).length,
    futureAppointmentsChecked,
  };
}

export async function upsertWeeklyMobileGroomingKpis(
  report: WeeklyMobileGroomingReport
): Promise<void> {
  const weekStart = new Date(`${report.weekStart}T00:00:00.000Z`);
  const rows = [
    {
      metricKey: MOBILE_GROOMING_KPI_METRICS.avgRebookRate,
      value: percentValue(report.rebookRatePercent),
    },
    {
      metricKey: MOBILE_GROOMING_KPI_METRICS.clientsServiced,
      value: numberValue(report.uniqueClients),
    },
    {
      metricKey: MOBILE_GROOMING_KPI_METRICS.newClientsServiced,
      value: numberValue(report.newClientsServiced),
    },
    {
      metricKey: MOBILE_GROOMING_KPI_METRICS.dogsServiced,
      value: numberValue(report.dogsServiced),
    },
    {
      metricKey: MOBILE_GROOMING_KPI_METRICS.totalRevenue,
      value: moneyValue(report.totalNetSalesCents),
    },
  ];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: KpiSegment.MOBILE_GROOMING,
            weekStart,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value },
        create: {
          segment: KpiSegment.MOBILE_GROOMING,
          weekStart,
          metricKey: row.metricKey,
          value: row.value,
        },
      })
    ) satisfies Prisma.PrismaPromise<unknown>[]
  );
}

export async function syncWeeklyMobileGroomingKpis(options: {
  weekStart: string;
  businessId?: string;
}): Promise<WeeklyMobileGroomingReport> {
  const report = await buildWeeklyMobileGroomingReport(options);
  await upsertWeeklyMobileGroomingKpis(report);
  return report;
}
