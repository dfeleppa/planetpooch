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
  totalNetSalesCents: number;
  appointmentsMissingCustomerId: number;
  appointmentsMissingPetServiceDetails: number;
};

function moneyValue(cents: number): number {
  return Math.round(cents);
}

function numberValue(value: number): number {
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

  return {
    weekStart: options.weekStart,
    weekEnd: toWeekParam(new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalAppointments: appointments.length,
    finishedAppointments: finishedAppointments.length,
    uniqueClients: clientIds.size,
    dogsServiced,
    totalNetSalesCents,
    appointmentsMissingCustomerId: finishedAppointments.filter(
      (appointment) => !appointment.customerId
    ).length,
    appointmentsMissingPetServiceDetails: finishedAppointments.filter(
      (appointment) => petServiceDetails(appointment).length === 0
    ).length,
  };
}

export async function upsertWeeklyMobileGroomingKpis(
  report: WeeklyMobileGroomingReport
): Promise<void> {
  const weekStart = new Date(`${report.weekStart}T00:00:00.000Z`);
  const rows = [
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
