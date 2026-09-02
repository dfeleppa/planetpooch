import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  streamCustomers,
  streamPackageDetails,
  streamPackages,
  type MoegoCustomerRow,
  type MoegoDate,
  type MoegoPackageDetail,
  type MoegoPackageRow,
} from "@/lib/moego/client";
import {
  EXPIRED_DAYCARE_PACKAGE_WINDOW_DAYS,
  getDaycarePackageRule,
  isWithinDaycarePackageExpirationWindow,
  isWithinExpiredDaycarePackageWindow,
  type DaycarePackageCreditReport,
  type DaycarePackageCreditReportRow,
} from "@/lib/moego/daycare-package-credit-types";

const UPCOMING_REPORT_ID = "daycare-package-credits";
const EXPIRED_REPORT_ID = "daycare-expired-packages";
const BUSINESS_TIME_ZONE = "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;
const PACKAGE_DETAIL_BATCH_SIZE = 500;

type DaycarePackageReportKind = "upcoming" | "expired";

function dateKeyInBusinessTimeZone(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function moegoDateKey(value: MoegoDate): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match?.[0] ?? null;
  }
  if (!value.year || !value.month || !value.day) return null;
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function dateFromKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function customerName(customer: MoegoCustomerRow | undefined): string {
  if (!customer) return "Unknown customer";
  return (
    customer.name?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    "Unknown customer"
  );
}

function remainingCredits(detail: MoegoPackageDetail | undefined): number {
  return (detail?.packageServices ?? []).reduce(
    (sum, service) => sum + Math.max(0, Number(service.remainingQuantity) || 0),
    0
  );
}

function isMissingSnapshotTable(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text.includes("MoegoDaycarePackageCreditReport") &&
    (text.includes("does not exist") || text.includes("P2021"))
  );
}

function serializeStoredReport(report: {
  generatedAt: Date;
  customersScanned: number;
  packagesScanned: number;
  matchingPackagesScanned: number;
  packageCount: number;
  totalRemainingCredits: number;
  rows: {
    packageId: string;
    customerId: string;
    customerName: string;
    email: string | null;
    phone: string | null;
    packageName: string;
    remainingCredits: number;
    expirationDate: Date;
    purchaseTime: Date | null;
    expirationWindowDays: number;
    daysUntilExpiration: number;
  }[];
}): DaycarePackageCreditReport {
  return {
    generatedAt: report.generatedAt.toISOString(),
    customersScanned: report.customersScanned,
    packagesScanned: report.packagesScanned,
    matchingPackagesScanned: report.matchingPackagesScanned,
    packageCount: report.packageCount,
    totalRemainingCredits: report.totalRemainingCredits,
    rows: report.rows.map((row) => ({
      packageId: row.packageId,
      customerId: row.customerId,
      customerName: row.customerName,
      email: row.email,
      phone: row.phone,
      packageName: row.packageName,
      remainingCredits: row.remainingCredits,
      expirationDate: row.expirationDate.toISOString().slice(0, 10),
      purchaseTime: row.purchaseTime?.toISOString() ?? null,
      expirationWindowDays: row.expirationWindowDays,
      daysUntilExpiration: row.daysUntilExpiration,
    })),
  };
}

async function getStoredDaycarePackageReport(
  reportId: string,
  expirationOrder: "asc" | "desc"
): Promise<DaycarePackageCreditReport | null> {
  try {
    const report = await prisma.moegoDaycarePackageCreditReport.findUnique({
      where: { id: reportId },
      include: {
        rows: {
          orderBy: [
            { expirationDate: expirationOrder },
            { packageName: "asc" },
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

export async function getStoredDaycarePackageCreditReport(): Promise<DaycarePackageCreditReport | null> {
  return getStoredDaycarePackageReport(UPCOMING_REPORT_ID, "asc");
}

export async function getStoredExpiredDaycarePackageReport(): Promise<DaycarePackageCreditReport | null> {
  return getStoredDaycarePackageReport(EXPIRED_REPORT_ID, "desc");
}

async function buildDaycarePackageCreditReport(
  kind: DaycarePackageReportKind,
  now = new Date()
): Promise<DaycarePackageCreditReport> {
  const customersById = new Map<string, MoegoCustomerRow>();
  const matchingPackages: MoegoPackageRow[] = [];
  let packagesScanned = 0;

  for await (const customers of streamCustomers({})) {
    const customerIds: string[] = [];
    for (const customer of customers) {
      if (!customer.id) continue;
      customersById.set(customer.id, customer);
      customerIds.push(customer.id);
    }

    if (customerIds.length === 0) continue;
    for await (const packages of streamPackages(customerIds)) {
      packagesScanned += packages.length;
      for (const packageRow of packages) {
        if (
          packageRow.id &&
          packageRow.status !== "STATUS_DELETED" &&
          Boolean(getDaycarePackageRule(packageRow.packageName))
        ) {
          matchingPackages.push(packageRow);
        }
      }
    }
  }

  const detailsByPackageId = new Map<string, MoegoPackageDetail>();
  for (let offset = 0; offset < matchingPackages.length; offset += PACKAGE_DETAIL_BATCH_SIZE) {
    const packageIds = matchingPackages
      .slice(offset, offset + PACKAGE_DETAIL_BATCH_SIZE)
      .map((row) => row.id);
    for await (const details of streamPackageDetails(packageIds)) {
      for (const detail of details) {
        const packageId = detail.packageInfo?.id;
        if (packageId) detailsByPackageId.set(packageId, detail);
      }
    }
  }

  const todayKey = dateKeyInBusinessTimeZone(now);
  const todayTime = dateFromKey(todayKey).getTime();
  const rows: DaycarePackageCreditReportRow[] = [];

  for (const packageRow of matchingPackages) {
    const rule = getDaycarePackageRule(packageRow.packageName);
    if (!rule) continue;

    // MoeGo's list endpoint currently reports zero at the package level even
    // when credits remain. The details endpoint is the source of truth.
    const credits = remainingCredits(detailsByPackageId.get(packageRow.id));

    const expirationDate = moegoDateKey(packageRow.expirationDate);
    if (!expirationDate || expirationDate === "9999-01-01") continue;
    const daysUntilExpiration = Math.round(
      (dateFromKey(expirationDate).getTime() - todayTime) / DAY_MS
    );
    const isIncluded =
      kind === "expired"
        ? isWithinExpiredDaycarePackageWindow(
            packageRow.packageName,
            daysUntilExpiration
          )
        : credits > 0 &&
          isWithinDaycarePackageExpirationWindow(
            packageRow.packageName,
            daysUntilExpiration
          );
    if (!isIncluded) {
      continue;
    }

    const customer = packageRow.customerId
      ? customersById.get(packageRow.customerId)
      : undefined;
    rows.push({
      packageId: packageRow.id,
      customerId: packageRow.customerId ?? "",
      customerName: customerName(customer),
      email: customer?.email?.trim() || null,
      phone: (customer?.mainPhoneNumber ?? customer?.phone)?.trim() || null,
      packageName: rule.packageName,
      remainingCredits: credits,
      expirationDate,
      purchaseTime: packageRow.purchaseTime ?? null,
      expirationWindowDays:
        kind === "expired"
          ? EXPIRED_DAYCARE_PACKAGE_WINDOW_DAYS
          : rule.expirationWindowDays,
      daysUntilExpiration,
    });
  }

  rows.sort((left, right) => {
    const dateOrder = left.expirationDate.localeCompare(right.expirationDate);
    return (
      (kind === "expired" ? -dateOrder : dateOrder) ||
      left.packageName.localeCompare(right.packageName) ||
      left.customerName.localeCompare(right.customerName)
    );
  });

  return {
    generatedAt: now.toISOString(),
    customersScanned: customersById.size,
    packagesScanned,
    matchingPackagesScanned: matchingPackages.length,
    packageCount: rows.length,
    totalRemainingCredits: rows.reduce((sum, row) => sum + row.remainingCredits, 0),
    rows,
  };
}

async function refreshDaycarePackageReport(
  reportId: string,
  kind: DaycarePackageReportKind
): Promise<DaycarePackageCreditReport> {
  const report = await buildDaycarePackageCreditReport(kind);
  const generatedAt = new Date(report.generatedAt);

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.moegoDaycarePackageCreditReport.upsert({
      where: { id: reportId },
      create: {
        id: reportId,
        generatedAt,
        customersScanned: report.customersScanned,
        packagesScanned: report.packagesScanned,
        matchingPackagesScanned: report.matchingPackagesScanned,
        packageCount: report.packageCount,
        totalRemainingCredits: report.totalRemainingCredits,
      },
      update: {
        generatedAt,
        customersScanned: report.customersScanned,
        packagesScanned: report.packagesScanned,
        matchingPackagesScanned: report.matchingPackagesScanned,
        packageCount: report.packageCount,
        totalRemainingCredits: report.totalRemainingCredits,
      },
    }),
    prisma.moegoDaycarePackageCreditRow.deleteMany({ where: { reportId } }),
  ];

  if (report.rows.length > 0) {
    operations.push(
      prisma.moegoDaycarePackageCreditRow.createMany({
        data: report.rows.map((row) => ({
          reportId,
          packageId: row.packageId,
          customerId: row.customerId,
          customerName: row.customerName,
          email: row.email,
          phone: row.phone,
          packageName: row.packageName,
          remainingCredits: row.remainingCredits,
          expirationDate: dateFromKey(row.expirationDate),
          purchaseTime: row.purchaseTime ? new Date(row.purchaseTime) : null,
          expirationWindowDays: row.expirationWindowDays,
          daysUntilExpiration: row.daysUntilExpiration,
        })),
      })
    );
  }

  await prisma.$transaction(operations);
  return (
    (await getStoredDaycarePackageReport(
      reportId,
      kind === "expired" ? "desc" : "asc"
    )) ?? report
  );
}

export async function refreshDaycarePackageCreditReport(): Promise<DaycarePackageCreditReport> {
  return refreshDaycarePackageReport(UPCOMING_REPORT_ID, "upcoming");
}

export async function refreshExpiredDaycarePackageReport(): Promise<DaycarePackageCreditReport> {
  return refreshDaycarePackageReport(EXPIRED_REPORT_ID, "expired");
}
