import type { KnowledgeSource } from "@/lib/knowledge";
import { findAppDataSources } from "@/lib/knowledge-app-data";
import { isKpiQuestion } from "@/lib/knowledge-kpis";
import { findProfitLossReport, profitMetric } from "@/lib/knowledge-report-profit-loss";
import { findKpiReport } from "@/lib/knowledge-report-kpis";
import { findAdReport } from "@/lib/knowledge-report-ads";
import { findPayrollSalesRatio, isPayrollSalesRatioQuestion } from "@/lib/knowledge-report-payroll-ratio";
import { isMobileGroomingSalesPerAppointmentQuestion, findMobileGroomingSalesPerAppointment } from "@/lib/knowledge-report-mobile-sales";
import { isDaycareVisitsPerStaffHourQuestion, isServiceRevenueTargetQuestion } from "@/lib/knowledge-report-kpis";
import { findFormSubmissionReport, isFormSubmissionCountQuestion } from "@/lib/knowledge-report-forms";

export type ReportKind = "catalog" | "profit-loss" | "kpis" | "payroll" | "ads" | "daycare" | "forms" | "kpi-history" | "funnel";

export const REPORT_CATALOG = [
  { title: "Profit & Loss", url: "/finance/profit-loss", details: "net sales, order count, estimated expenses, and net profit by business and date" },
  { title: "KPIs", url: "/finance/kpis", details: "weekly and period KPI actuals for boarding, daycare, training, and grooming" },
  { title: "Payroll", url: "/finance/payroll", details: "saved Pet Resort runs, hours, and Mobile Grooming payroll entries" },
  { title: "Advertising", url: "/marketing/ad-reporting", details: "saved Meta and Google campaign report rows and their dated metrics" },
  { title: "New Form Submissions", url: "/marketing/website-attribution/new-form-submissions", details: "saved website lead forms received by business and date" },
  { title: "Daycare packages", url: "/operations/daycare/packages", details: "saved expiring and expired package snapshots" },
  { title: "Not Active daycare", url: "/operations/daycare/not-active", details: "saved inactive customer snapshot" },
] as const;

export function reportKind(question: string): ReportKind | null {
  if (/\b(?:what|which|list|show)\b.*\breports?\b|\breports? (?:can|available)\b/i.test(question)) return "catalog";
  if (isFormSubmissionCountQuestion(question)) return "forms";
  if (isPayrollSalesRatioQuestion(question)) return "payroll";
  if (isMobileGroomingSalesPerAppointmentQuestion(question)) return "profit-loss";
  if (isDaycareVisitsPerStaffHourQuestion(question) || isServiceRevenueTargetQuestion(question)) return "kpis";
  if (/\b(?:not active|inactive)\b.*\b(?:daycare|clients?|customers?)\b|\bdaycare\b.*\b(?:not active|inactive)\b/i.test(question)
    || /\bexpir(?:ed|ing|e|ation)\b.*\b(?:daycare|packages?|credits?)\b/i.test(question)
    || /\b(?:daycare|packages?|credits?)\b.*\bexpir(?:ed|ing|e|ation)\b/i.test(question)) return "daycare";
  if (/\b(?:daycare staff hours?|kpi staff hours?)\b/i.test(question)) return "kpis";
  if (/\b(?:ad spend|google ads?|facebook ads?|meta ads?|campaigns?|impressions?|clicks?|cpl|cpc|ctr|roas|cost per lead|advertising)\b/i.test(question)) return "ads";
  if (/\b(?:profit(?:able|ability)?|margin|earnings)\b/i.test(question)) return "profit-loss";
  if (/\b(?:payroll|paychecks?|timecards?|wages?|commissions?|staff hours?)\b/i.test(question)) return "payroll";
  if (/\b(?:profit\s*(?:&|and)\s*loss|p\s*&\s*l|net sales|net profit|estimated expenses)\b/i.test(question)) return "profit-loss";
  if (/\b(?:total|overall) revenue\b/i.test(question) && !/\b(?:boarding|daycare|training|in[ -]?house)\b/i.test(question)) return "profit-loss";
  if (isKpiQuestion(question)) return "kpis";
  if (profitMetric(question)) return "profit-loss";
  return null;
}

export async function findReportSources(question: string): Promise<KnowledgeSource[] | null> {
  const kind = reportKind(question);
  if (!kind) return null;
  return findReportSourcesForKind(kind, question);
}

/** A validated semantic plan can select a report without depending on its wording regex. */
export async function findReportSourcesForKind(kind: ReportKind, question: string): Promise<KnowledgeSource[]> {
  if (kind === "kpi-history") return (await import("@/lib/knowledge-kpi-history")).findKpiHistory(question);
  if (kind === "funnel") return (await import("@/lib/knowledge-funnel")).findFunnelEvidence(question);
  if (kind === "catalog") {
    return REPORT_CATALOG.map((report) => ({
      id: `record:report:catalog:${report.title}`, title: report.title,
      kind: "record" as const, url: report.url, excerpt: report.details,
      updatedAt: new Date().toISOString(), dateKind: "entry" as const,
    }));
  }
  if (kind === "profit-loss") {
    const reports = await (isMobileGroomingSalesPerAppointmentQuestion(question)
      ? findMobileGroomingSalesPerAppointment(question) : findProfitLossReport(question));
    if (/\b(?:labor costs?|labour costs?|payroll|wages?)\b/i.test(question)) {
      const payroll = await findAppDataSources(`${question} payroll`, []);
      return [...reports, ...payroll.filter((source) => /record:(?:payroll|commission)/.test(source.id))];
    }
    return reports;
  }
  if (kind === "kpis") return findKpiReport(question);
  if (kind === "payroll") {
    if (isPayrollSalesRatioQuestion(question)) return findPayrollSalesRatio(question);
    const sources = await findAppDataSources(question, []);
    return sources.filter((source) => /record:(?:payroll|commission)/.test(source.id));
  }
  if (kind === "ads") return findAdReport(question);
  if (kind === "forms") return findFormSubmissionReport(question);
  const { findDaycareReport } = await import("@/lib/knowledge-report-daycare");
  return findDaycareReport(question);
}
