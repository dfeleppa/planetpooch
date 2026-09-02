import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  streamAppointments,
  streamCustomers,
  type MoegoAppointmentRow,
  type MoegoCustomerRow,
} from "@/lib/moego/client";
import { PET_RESORT_BUSINESS_ID } from "@/lib/moego/daycare-weekly-report";
import {
  DAYCARE_INACTIVITY_DAYS,
  DAYCARE_INACTIVITY_MAX_DAYS,
  type DaycareNotActiveReport,
  type DaycareNotActiveReportRow,
} from "@/lib/moego/daycare-not-active-types";

const REPORT_ID = "daycare-not-active";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function customerName(customer: MoegoCustomerRow): string {
  return (
    customer.name?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    "Unknown customer"
  );
}

function isDeletedCustomer(customer: MoegoCustomerRow): boolean {
  return customer.deleted === true || customer.status === "STATUS_DELETED";
}

function appointmentEnd(appointment: MoegoAppointmentRow): Date | null {
  return (
    parseDate(appointment.checkOutTime) ??
    parseDate(appointment.duration?.endTime) ??
    parseDate(appointment.duration?.startTime)
  );
}

function appointmentStart(appointment: MoegoAppointmentRow): Date | null {
  return (
    parseDate(appointment.duration?.startTime) ??
    parseDate(appointment.checkInTime) ??
    appointmentEnd(appointment)
  );
}

function isMissingSnapshotTable(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text.includes("MoegoDaycareNotActiveReport") &&
    (text.includes("does not exist") || text.includes("P2021"))
  );
}

function serializeStoredReport(report: {
  generatedAt: Date;
  cutoffDate: Date;
  inactivityDays: number;
  customersScanned: number;
  daycareCustomersScanned: number;
  customerCount: number;
  rows: {
    customerId: string;
    customerName: string;
    email: string | null;
    phone: string | null;
    lastAppointmentDate: Date | null;
    nextAppointmentDate: Date | null;
    daysSinceLastAppointment: number | null;
    preferredBusinessId: string | null;
    tags: string[];
  }[];
}): DaycareNotActiveReport {
  return {
    generatedAt: report.generatedAt.toISOString(),
    cutoffDate: report.cutoffDate.toISOString(),
    inactivityDays: report.inactivityDays,
    customersScanned: report.customersScanned,
    daycareCustomersScanned: report.daycareCustomersScanned,
    customerCount: report.customerCount,
    rows: report.rows.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      email: row.email,
      phone: row.phone,
      lastAppointmentDate: row.lastAppointmentDate?.toISOString() ?? null,
      nextAppointmentDate: row.nextAppointmentDate?.toISOString() ?? null,
      daysSinceLastAppointment: row.daysSinceLastAppointment,
      preferredBusinessId: row.preferredBusinessId,
      tags: row.tags,
    })),
  };
}

export async function getStoredDaycareNotActiveReport(): Promise<DaycareNotActiveReport | null> {
  try {
    const report = await prisma.moegoDaycareNotActiveReport.findUnique({
      where: { id: REPORT_ID },
      include: {
        rows: {
          orderBy: [
            { lastAppointmentDate: { sort: "desc", nulls: "last" } },
            { customerName: "asc" },
          ],
        },
      },
    });
    return report ? serializeStoredReport(report) : null;
  } catch (error) {
    if (isMissingSnapshotTable(error)) return null;
    throw error;
  }
}

async function loadCustomers(): Promise<{
  customersById: Map<string, MoegoCustomerRow>;
  customersScanned: number;
}> {
  const customersById = new Map<string, MoegoCustomerRow>();
  let customersScanned = 0;

  for await (const customers of streamCustomers({})) {
    customersScanned += customers.length;
    for (const customer of customers) {
      if (customer.id && !isDeletedCustomer(customer)) {
        customersById.set(customer.id, customer);
      }
    }
  }

  return { customersById, customersScanned };
}

async function loadDaycareAttendance(now: Date): Promise<{
  lastCompletedByCustomerId: Map<string, Date>;
  activeOrUpcomingCustomerIds: Set<string>;
}> {
  const lastCompletedByCustomerId = new Map<string, Date>();
  const activeOrUpcomingCustomerIds = new Set<string>();
  const scanStart = new Date(
    now.getTime() - DAYCARE_INACTIVITY_MAX_DAYS * DAY_MS
  );
  const scanEnd = new Date(now);
  scanEnd.setUTCFullYear(scanEnd.getUTCFullYear() + 2);

  for await (const appointments of streamAppointments(
    {
      startTime: {
        startTime: scanStart.toISOString(),
        endTime: scanEnd.toISOString(),
      },
      serviceTypes: ["DAYCARE"],
    },
    [PET_RESORT_BUSINESS_ID]
  )) {
    for (const appointment of appointments) {
      if (
        !appointment.customerId ||
        appointment.isDeleted ||
        appointment.noShow
      ) {
        continue;
      }

      if (appointment.status === "FINISHED") {
        const completedAt = appointmentEnd(appointment);
        if (!completedAt || completedAt > now) continue;

        const previous = lastCompletedByCustomerId.get(appointment.customerId);
        if (!previous || completedAt > previous) {
          lastCompletedByCustomerId.set(appointment.customerId, completedAt);
        }
        continue;
      }

      if (appointment.status === "CANCELED") continue;
      const startsAt = appointmentStart(appointment);
      const endsAt = appointmentEnd(appointment);
      if ((startsAt && startsAt >= now) || (endsAt && endsAt >= now)) {
        activeOrUpcomingCustomerIds.add(appointment.customerId);
      }
    }
  }

  return { lastCompletedByCustomerId, activeOrUpcomingCustomerIds };
}

async function buildDaycareNotActiveReport(
  now = new Date()
): Promise<DaycareNotActiveReport> {
  const cutoffDate = new Date(now.getTime() - DAYCARE_INACTIVITY_DAYS * DAY_MS);
  const [customerData, attendance] = await Promise.all([
    loadCustomers(),
    loadDaycareAttendance(now),
  ]);
  const rows: DaycareNotActiveReportRow[] = [];

  for (const [
    customerId,
    lastAppointmentDate,
  ] of attendance.lastCompletedByCustomerId) {
    if (
      lastAppointmentDate >= cutoffDate ||
      attendance.activeOrUpcomingCustomerIds.has(customerId)
    ) {
      continue;
    }

    const customer = customerData.customersById.get(customerId);
    if (!customer) continue;

    rows.push({
      customerId,
      customerName: customerName(customer),
      email: customer.email?.trim() || null,
      phone: (customer.mainPhoneNumber ?? customer.phone)?.trim() || null,
      lastAppointmentDate: lastAppointmentDate.toISOString(),
      nextAppointmentDate: null,
      daysSinceLastAppointment: Math.floor(
        (now.getTime() - lastAppointmentDate.getTime()) / DAY_MS
      ),
      preferredBusinessId: PET_RESORT_BUSINESS_ID,
      tags: [],
    });
  }

  rows.sort(
    (left, right) =>
      (right.lastAppointmentDate ?? "").localeCompare(
        left.lastAppointmentDate ?? ""
      ) || left.customerName.localeCompare(right.customerName)
  );

  console.info("[daycare:not-active] report built", {
    inactivityDays: DAYCARE_INACTIVITY_DAYS,
    maxDaysSinceLastVisit: DAYCARE_INACTIVITY_MAX_DAYS,
    customersScanned: customerData.customersScanned,
    completedDaycareCustomers: attendance.lastCompletedByCustomerId.size,
    activeOrUpcomingCustomers: attendance.activeOrUpcomingCustomerIds.size,
    resultCount: rows.length,
  });

  return {
    generatedAt: now.toISOString(),
    cutoffDate: cutoffDate.toISOString(),
    inactivityDays: DAYCARE_INACTIVITY_DAYS,
    customersScanned: customerData.customersScanned,
    daycareCustomersScanned: attendance.lastCompletedByCustomerId.size,
    customerCount: rows.length,
    rows,
  };
}

export async function refreshDaycareNotActiveReport(): Promise<DaycareNotActiveReport> {
  const report = await buildDaycareNotActiveReport();
  const generatedAt = new Date(report.generatedAt);
  const cutoffDate = new Date(report.cutoffDate);

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.moegoDaycareNotActiveReport.upsert({
      where: { id: REPORT_ID },
      create: {
        id: REPORT_ID,
        generatedAt,
        cutoffDate,
        inactivityDays: report.inactivityDays,
        customersScanned: report.customersScanned,
        daycareCustomersScanned: report.daycareCustomersScanned,
        customerCount: report.customerCount,
      },
      update: {
        generatedAt,
        cutoffDate,
        inactivityDays: report.inactivityDays,
        customersScanned: report.customersScanned,
        daycareCustomersScanned: report.daycareCustomersScanned,
        customerCount: report.customerCount,
      },
    }),
    prisma.moegoDaycareNotActiveRow.deleteMany({ where: { reportId: REPORT_ID } }),
  ];

  if (report.rows.length > 0) {
    operations.push(
      prisma.moegoDaycareNotActiveRow.createMany({
        data: report.rows.map((row) => ({
          reportId: REPORT_ID,
          customerId: row.customerId,
          customerName: row.customerName,
          email: row.email,
          phone: row.phone,
          lastAppointmentDate: row.lastAppointmentDate
            ? new Date(row.lastAppointmentDate)
            : null,
          nextAppointmentDate: null,
          daysSinceLastAppointment: row.daysSinceLastAppointment,
          preferredBusinessId: row.preferredBusinessId,
          tags: row.tags,
        })),
      })
    );
  }

  await prisma.$transaction(operations);
  return (await getStoredDaycareNotActiveReport()) ?? report;
}
