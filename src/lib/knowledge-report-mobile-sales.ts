import { BUSINESSES } from "@/lib/business";
import type { KnowledgeSource } from "@/lib/knowledge";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";
import { getProfitLossTotals } from "@/lib/moego/profit-loss-totals";
import { prisma } from "@/lib/prisma";

const dayMs = 86_400_000;

export function isMobileGroomingSalesPerAppointmentQuestion(question: string): boolean {
  return /\bmobile[ -]?grooming\b/i.test(question)
    && /\b(?:net sales|revenue)\s+per\s+(?:appointment|stop)\b/i.test(question)
    && /\b(?:last|most recent) completed (?:reporting )?week\b/i.test(question);
}

/** Mobile Grooming payroll reports use completed Saturday–Friday weeks in Eastern time. */
export function completedMobileGroomingWeek(now = new Date()) {
  const today = formatEasternDate(now);
  const date = new Date(`${today}T00:00:00.000Z`);
  const daysSinceCompletedFriday = (date.getUTCDay() + 1) % 7 + 1;
  const end = new Date(date.getTime() - daysSinceCompletedFriday * dayMs);
  const start = new Date(end.getTime() - 6 * dayMs);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function findMobileGroomingSalesPerAppointment(_question: string): Promise<KnowledgeSource[]> {
  const week = completedMobileGroomingWeek();
  const from = new Date(`${week.start}T00:00:00.000Z`);
  const to = new Date(Date.parse(`${week.end}T00:00:00.000Z`) + dayMs);
  const [totals, payrollWeek, sync] = await Promise.all([
    getProfitLossTotals(BUSINESSES[1].moegoId, from, to),
    prisma.financePayrollWeek.findUnique({
      where: { business_weekStart: { business: "mobile-grooming", weekStart: from } },
      select: { updatedAt: true, mobileGroomingWeeklyOverride: { select: { stops: true } },
        _count: { select: { mobileGroomingEntries: true } } },
    }),
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
  ]);
  const stops = payrollWeek?.mobileGroomingWeeklyOverride?.stops ?? payrollWeek?._count.mobileGroomingEntries;
  const money = (cents: number) => (cents / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const answer = !sync?.lastSyncedAt || formatEasternDate(sync.lastSyncedAt) < week.end
    ? `I cannot verify Mobile Grooming net sales per appointment for ${week.start}–${week.end} because the recorded order sync does not cover the completed week. [1]`
    : stops === undefined
      ? `I cannot calculate Mobile Grooming net sales per appointment for ${week.start}–${week.end}: no saved payroll appointment count exists for that Saturday–Friday week. Profit & Loss net sales were ${money(totals.revenueCents)}. [1]`
      : stops <= 0
        ? `I cannot calculate Mobile Grooming net sales per appointment for ${week.start}–${week.end}: the saved payroll appointment count is ${stops}. Profit & Loss net sales were ${money(totals.revenueCents)}. [1]`
        : `Mobile Grooming net sales per saved payroll appointment were ${money(Math.round(totals.revenueCents / stops))} for ${week.start}–${week.end}: ${money(totals.revenueCents)} Profit & Loss net sales divided by ${stops} saved payroll appointments. The payroll count uses the weekly override when present. Latest order sync: ${sync.lastSyncedAt.toISOString().slice(0, 10)}. [1]`;
  return [{
    id: `record:report:mobile-sales-per-appointment:${week.start}`,
    title: `Mobile Grooming net sales per appointment, ${week.start}–${week.end}`,
    kind: "record", url: `/finance/profit-loss?from=${week.start}&to=${week.end}&business=mobile-grooming`,
    excerpt: answer, answer,
    updatedAt: payrollWeek?.updatedAt.toISOString() ?? sync?.updatedAt.toISOString() ?? new Date().toISOString(),
    dateKind: "entry",
  }];
}
