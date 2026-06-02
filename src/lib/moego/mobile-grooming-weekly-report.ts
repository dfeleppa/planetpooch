import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addWeeks, toWeekParam, fromWeekParam } from "@/lib/week";
import {
  streamAppointments,
  streamCustomers,
  toCents,
  type MoegoAppointmentRow,
  type MoegoCustomerRow,
} from "@/lib/moego/client";

export const MOBILE_GROOMING_BUSINESS_ID = "bizVdfk";

const MOBILE_GROOMING_KPI_METRICS = {
  avgRebookRate: "avg_rebook_rate",
  clientsServiced: "clients_serviced",
  dogsServiced: "dogs_serviced",
  totalRevenue: "total_revenue",
} as const;

export type WeeklyMobileGroomingReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalAppointments: number;
  finishedAppointments: number;
  uniqueClients: number;
  dogsServiced: number;
  rebookedClients: number;
  rebookRatePercent: number;
  totalNetSalesCents: number;
  appointmentsMissingCustomerId: number;
  appointmentsMissingPetServiceDetails: number;
  customersMissingUpcomingUrl: number;
  upcomingLookupErrors: number;
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

async function listCustomersById(
  customerIds: Set<string>
): Promise<MoegoCustomerRow[]> {
  if (customerIds.size === 0) return [];

  const customers: MoegoCustomerRow[] = [];
  for await (const page of streamCustomers({})) {
    for (const customer of page) {
      if (customerIds.has(customer.id)) customers.push(customer);
    }
    if (customers.length === customerIds.size) break;
  }
  return customers;
}

function upcomingToken(customer: MoegoCustomerRow): string | null {
  if (!customer.upcomingAppointmentsUrl) return null;
  try {
    return new URL(customer.upcomingAppointmentsUrl).searchParams.get("id");
  } catch {
    return null;
  }
}

type UpcomingAppointmentResponse = {
  data?: {
    upComingAppoint?: unknown[];
  };
};

async function hasUpcomingAppointment(token: string): Promise<boolean> {
  const res = await fetch(
    `https://client.moego.pet/api/grooming/appointment/customer/upcoming?id=${encodeURIComponent(token)}`,
    { cache: "no-store", headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    throw new Error(`MoeGo upcoming appointments HTTP ${res.status}`);
  }

  const payload = (await res.json()) as UpcomingAppointmentResponse;
  return (payload.data?.upComingAppoint ?? []).length > 0;
}

async function rebookSummary(customerIds: Set<string>): Promise<{
  rebookedClients: number;
  customersMissingUpcomingUrl: number;
  upcomingLookupErrors: number;
}> {
  const customers = await listCustomersById(customerIds);
  let rebookedClients = 0;
  let customersMissingUpcomingUrl = customerIds.size - customers.length;
  let upcomingLookupErrors = 0;
  const concurrency = 10;

  for (let i = 0; i < customers.length; i += concurrency) {
    const batch = customers.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (customer) => {
        const token = upcomingToken(customer);
        if (!token) return "missing" as const;
        try {
          return (await hasUpcomingAppointment(token))
            ? ("rebooked" as const)
            : ("not_rebooked" as const);
        } catch {
          return "error" as const;
        }
      })
    );

    for (const result of results) {
      if (result === "rebooked") rebookedClients++;
      if (result === "missing") customersMissingUpcomingUrl++;
      if (result === "error") upcomingLookupErrors++;
    }
  }

  return { rebookedClients, customersMissingUpcomingUrl, upcomingLookupErrors };
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
  const {
    rebookedClients,
    customersMissingUpcomingUrl,
    upcomingLookupErrors,
  } = await rebookSummary(clientIds);
  const rebookRatePercent =
    clientIds.size > 0 ? (rebookedClients / clientIds.size) * 100 : 0;

  return {
    weekStart: options.weekStart,
    weekEnd: toWeekParam(new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalAppointments: appointments.length,
    finishedAppointments: finishedAppointments.length,
    uniqueClients: clientIds.size,
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
    customersMissingUpcomingUrl,
    upcomingLookupErrors,
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
