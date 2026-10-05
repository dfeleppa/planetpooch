import { prisma } from "@/lib/prisma";

export async function metaInsightWhere(business: string, from: Date, toExclusive: Date) {
  const company = business === "pet-resort" ? "RESORT" : business === "mobile-grooming" ? "GROOMING" : null;
  const assignments = company
    ? await prisma.metaCampaignBusiness.findMany({ where: { companies: { has: company } }, select: { campaignId: true } })
    : null;
  return {
    date: { gte: from, lt: toExclusive },
    ...(assignments ? { campaignId: { in: assignments.map((row) => row.campaignId) } } : {}),
  };
}

export async function getMetaPeriodMetrics(business: string, from: Date, toExclusive: Date) {
  const where = await metaInsightWhere(business, from, toExclusive);
  const [totals, bounds] = await Promise.all([
    prisma.metaAdInsight.aggregate({ where, _sum: { spendCents: true, purchaseValueCents: true }, _count: { _all: true } }),
    prisma.metaAdInsight.aggregate({ where, _min: { date: true }, _max: { date: true } }),
  ]);
  const end = new Date(Math.min(toExclusive.getTime() - 86_400_000, Date.now()));
  const through = bounds._max.date?.toISOString().slice(0, 10) ?? null;
  const complete = Boolean(
    bounds._min.date && bounds._min.date <= from && bounds._max.date && bounds._max.date >= new Date(end.toISOString().slice(0, 10)),
  );
  return {
    spendCents: complete ? totals._sum.spendCents ?? 0 : null,
    purchaseValueCents: complete ? totals._sum.purchaseValueCents ?? 0 : null,
    complete,
    through,
  };
}
