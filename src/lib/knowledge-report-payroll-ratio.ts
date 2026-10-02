import type { KnowledgeSource } from "@/lib/knowledge";
import { payrollPayPeriod } from "@/lib/knowledge-app-data";
import { completedReportWeeks, reportPeriod } from "@/lib/knowledge-report-period";
import { getProfitLossTotals } from "@/lib/moego/profit-loss-totals";
import { BUSINESSES } from "@/lib/business";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function isPayrollSalesRatioQuestion(question: string): boolean {
  return /\bpayroll\b/i.test(question)
    && (/\b(?:percent(?:age)?|share|ratio|portion)\b/i.test(question) || question.includes("%"))
    && /\b(?:net sales|sales|revenue)\b/i.test(question)
    && /\bweek\b/i.test(question);
}

export async function findPayrollSalesRatio(question: string): Promise<KnowledgeSource[]> {
  const period = reportPeriod(question) ?? completedReportWeeks(1)[0];
  const active = await getActiveBusiness();
  const business = /\bmobile[ -]?grooming\b/i.test(question) ? BUSINESSES[1]
    : /\bpet[ -]?resort\b/i.test(question) ? BUSINESSES[0] : active;
  const checked = new Date();
  const source = (answer: string): KnowledgeSource[] => [{
    id: `record:report:payroll-sales-ratio:${business.key}:${period.start}:${period.end}`,
    title: `Payroll as a share of net sales: ${business.label}, ${period.label}`,
    kind: "record", url: business.key === "pet-resort" ? "/finance/payroll" : "/finance/payroll/mobile-grooming",
    excerpt: answer, answer, updatedAt: checked.toISOString(), dateKind: "entry",
  }];
  if (period.kind !== "week") return source("I can verify payroll as a share of net sales only for a matching weekly pay period. Please ask for a specific completed week. [1]");
  if (period.end >= formatEasternDate(new Date())) return source(`${period.label} is not complete yet, so I cannot verify a full-week payroll share of net sales. [1]`);
  if (business.key !== "pet-resort") return source("I cannot verify Mobile Grooming payroll as a share of net sales from the Pet Resort payroll ledger. The Mobile Grooming payroll report uses appointment and groomer-pay totals with a different Saturday–Friday period. [1]");
  const runs = await prisma.financePetResortPayrollRun.findMany({
    where: { payPeriod: payrollPayPeriod(period) }, select: { amount: true },
  });
  if (!runs.length) return source(`No saved Pet Resort payroll run matches ${period.start}–${period.end}; the payroll share of net sales is unavailable, not 0%. [1]`);
  const sync = await prisma.moegoSyncState.findUnique({ where: { resource: "order" } });
  if (!sync?.lastSyncedAt || formatEasternDate(sync.lastSyncedAt) < period.end) return source(`Pet Resort payroll is saved for ${period.start}–${period.end}, but the recorded order sync does not cover the full week, so matching net sales and the payroll share cannot be verified. [1]`);
  const from = new Date(`${period.start}T00:00:00.000Z`);
  const to = new Date(new Date(`${period.end}T00:00:00.000Z`).getTime() + 86_400_000);
  const sales = await getProfitLossTotals(BUSINESSES[0].moegoId, from, to);
  if (sales.revenueCents <= 0) return source(`Pet Resort has saved payroll for ${period.start}–${period.end}, but the Profit & Loss report has ${money(sales.revenueCents)} in net sales, so a meaningful payroll percentage cannot be calculated. [1]`);
  const payrollCents = runs.reduce((sum, run) => sum + Math.round(Number(run.amount) * 100), 0);
  const ratio = payrollCents / sales.revenueCents * 100;
  return source(`Pet Resort saved payroll was ${ratio.toFixed(1)}% of net sales for ${period.start}–${period.end}: ${money(payrollCents)} across ${runs.length} saved payroll run${runs.length === 1 ? "" : "s"} divided by ${money(sales.revenueCents)} in Profit & Loss net sales. This covers saved payroll entries only; completeness of the ledger is not independently verified. Latest order sync: ${sync.lastSyncedAt.toISOString().slice(0, 10)}. [1]`);
}
