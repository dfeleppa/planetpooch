import type { KnowledgeSource } from "@/lib/knowledge";
import { getStoredDaycarePackageCreditReport, getStoredExpiredDaycarePackageReport } from "@/lib/moego/daycare-package-credit-report";
import { getStoredDaycareNotActiveReport } from "@/lib/moego/daycare-not-active-report";

export async function findDaycareReport(question: string): Promise<KnowledgeSource[]> {
  const notActive = /\b(?:not active|inactive)\b/i.test(question);
  const expired = /\bexpired\b/i.test(question);
  const report = notActive ? await getStoredDaycareNotActiveReport()
    : expired ? await getStoredExpiredDaycarePackageReport()
      : await getStoredDaycarePackageCreditReport();
  const title = notActive ? "Not Active daycare report"
    : expired ? "Expired daycare packages report" : "Expiring daycare packages report";
  const url = notActive ? "/operations/daycare/not-active"
    : expired ? "/operations/daycare/expired-packages" : "/operations/daycare/packages";
  if (!report) return [{
    id: `record:report:daycare:missing:${notActive ? "inactive" : expired ? "expired" : "upcoming"}`,
    title, kind: "record", url,
    excerpt: `No saved ${title.toLowerCase()} snapshot is available. Missing data does not mean zero clients or packages.`,
    updatedAt: new Date().toISOString(), dateKind: "entry",
    answer: `I cannot give a reliable count because the ${title} has no saved snapshot yet. [1]`,
  }];
  const generatedAt = report.generatedAt;
  const isInactive = "customerCount" in report;
  const lines = isInactive
    ? [
        `Customers in report: ${report.customerCount}. Inactivity threshold: ${report.inactivityDays} days.`,
        `Customers scanned: ${report.customersScanned}; daycare customers scanned: ${report.daycareCustomersScanned}.`,
        ...report.rows.slice(0, 10).map((row) => `${row.customerName}: last appointment ${row.lastAppointmentDate ?? "unknown"}; ${row.daysSinceLastAppointment ?? "unknown"} days since last appointment.`),
      ]
    : [
        `Packages in report: ${report.packageCount}; total remaining credits: ${report.totalRemainingCredits}.`,
        `Customers scanned: ${report.customersScanned}; packages scanned: ${report.packagesScanned}.`,
        ...report.rows.slice(0, 10).map((row) => `${row.customerName}: ${row.packageName}; ${row.remainingCredits} credits; expires ${row.expirationDate}.`),
      ];
  const asksCount = /\b(?:how many|count|number of)\b/i.test(question);
  const count = isInactive ? report.customerCount : report.packageCount;
  const answer = asksCount
    ? `The ${title} contains ${count} ${isInactive ? "customers" : "packages"} in its saved snapshot from ${generatedAt.slice(0, 10)}. [1]`
    : undefined;
  return [{
    id: `record:report:daycare:${notActive ? "inactive" : expired ? "expired" : "upcoming"}:${generatedAt}`,
    title, kind: "record", url,
    excerpt: [`Saved ${title}; generated ${generatedAt}. This report changes only when refreshed.`, ...lines,
      `Only the first ${Math.min(report.rows.length, 10)} of ${report.rows.length} rows are listed here; use the report page for the full list.`].join("\n").slice(0, 1800),
    updatedAt: generatedAt, dateKind: "source", answer,
  }];
}
