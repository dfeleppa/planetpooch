import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  readTags,
  streamCustomers,
  type MoegoCustomerRow,
} from "@/lib/moego/client";
import {
  DAYCARE_INACTIVITY_DAYS,
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

function isDaycareCustomer(customer: MoegoCustomerRow): boolean {
  return readTags(customer.tags).some(
    (tag) => tag.trim().toLowerCase() === "daycare"
  );
}

function isDeletedCustomer(customer: MoegoCustomerRow): boolean {
  return customer.deleted === true || customer.status === "STATUS_DELETED";
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
          orderBy: { customerName: "asc" },
        },
      },
    });
    return report ? serializeStoredReport(report) : null;
  } catch (error) {
    if (isMissingSnapshotTable(error)) return null;
    throw error;
  }
}

async function buildDaycareNotActiveReport(
  now = new Date()
): Promise<DaycareNotActiveReport> {
  const cutoffDate = new Date(now.getTime() - DAYCARE_INACTIVITY_DAYS * DAY_MS);
  const rows: DaycareNotActiveReportRow[] = [];
  let customersScanned = 0;
  let daycareCustomersScanned = 0;

  for await (const customers of streamCustomers({})) {
    customersScanned += customers.length;
    for (const customer of customers) {
      if (!customer.id || isDeletedCustomer(customer) || !isDaycareCustomer(customer)) {
        continue;
      }
      daycareCustomersScanned++;

      const lastAppointmentDate = parseDate(customer.lastAppointmentDate);
      const daysSinceLastAppointment = lastAppointmentDate
        ? Math.max(
            0,
            Math.floor((now.getTime() - lastAppointmentDate.getTime()) / DAY_MS)
          )
        : null;

      rows.push({
        customerId: customer.id,
        customerName: customerName(customer),
        email: customer.email?.trim() || null,
        phone: (customer.mainPhoneNumber ?? customer.phone)?.trim() || null,
        lastAppointmentDate: lastAppointmentDate?.toISOString() ?? null,
        nextAppointmentDate: parseDate(customer.nextAppointmentDate)?.toISOString() ?? null,
        daysSinceLastAppointment,
        preferredBusinessId: customer.preferredBusinessId ?? null,
        tags: readTags(customer.tags),
      });
    }
  }

  rows.sort((left, right) => left.customerName.localeCompare(right.customerName));

  return {
    generatedAt: now.toISOString(),
    cutoffDate: cutoffDate.toISOString(),
    inactivityDays: DAYCARE_INACTIVITY_DAYS,
    customersScanned,
    daycareCustomersScanned,
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
          nextAppointmentDate: row.nextAppointmentDate
            ? new Date(row.nextAppointmentDate)
            : null,
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
