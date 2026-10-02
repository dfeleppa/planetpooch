import { prisma } from "@/lib/prisma";
import { getActiveBusiness } from "@/lib/business-server";
import { reportPeriod } from "@/lib/knowledge-report-period";
import type { KnowledgeSource } from "@/lib/knowledge";

type CampaignRow = {
  campaign: string;
  periodStart: Date;
  periodEnd: Date;
  clicks: number | null;
  costCents: number | null;
  revenueCents: number | null;
  leads: number | null;
  sales: number | null;
  impressions: number | null;
  updatedAt: Date;
};

const money = (cents: number) => (cents / 100).toLocaleString("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const date = (value: Date) => value.toISOString().slice(0, 10);

export function adMetric(question: string): "spend" | "revenue" | "leads" | "clicks" | "impressions" | "sales" | "roas" | "cpl" | "cpc" | "ctr" | null {
  if (/\b(?:roas|return on ad spend)\b/i.test(question)) return "roas";
  if (/\b(?:cpl|cost per lead)\b/i.test(question)) return "cpl";
  if (/\b(?:cpc|cost per click)\b/i.test(question)) return "cpc";
  if (/\b(?:ctr|click.through rate)\b/i.test(question)) return "ctr";
  if (/\b(?:ad spend|spend|cost)\b/i.test(question)) return "spend";
  if (/\b(?:ad revenue|campaign revenue|return on ad spend|roas)\b/i.test(question)) return "revenue";
  if (/\bleads?\b/i.test(question)) return "leads";
  if (/\bclicks?\b/i.test(question)) return "clicks";
  if (/\bimpressions?\b/i.test(question)) return "impressions";
  if (/\bsales?\b/i.test(question)) return "sales";
  return null;
}

export function isAdPlatformCplComparisonQuestion(question: string): boolean {
  return /\b(?:meta|facebook)\b/i.test(question) && /\bgoogle(?: ads?)?\b/i.test(question)
    && /\b(?:cpl|cost per lead)\b/i.test(question);
}

function fullSavedMonth(periodStart: Date, periodEnd: Date): boolean {
  const start = date(periodStart);
  const end = date(periodEnd);
  return start.endsWith("-01") && end === new Date(Date.UTC(Number(start.slice(0, 4)),
    Number(start.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

function completeCpl(rows: CampaignRow[]): { leads: number; cpl: number } | null {
  if (!rows.length || rows.some((row) => row.leads === null || row.costCents === null)) return null;
  const leads = rows.reduce((sum, row) => sum + row.leads!, 0);
  const costCents = rows.reduce((sum, row) => sum + row.costCents!, 0);
  return leads > 0 ? { leads, cpl: Math.round(costCents / leads) } : null;
}

async function findAdPlatformCplComparison(business: string): Promise<KnowledgeSource[]> {
  const selection = { campaign: true, periodStart: true, periodEnd: true, clicks: true,
    costCents: true, revenueCents: true, leads: true, sales: true, impressions: true, updatedAt: true } as const;
  const [metaPeriods, googlePeriods] = await Promise.all([
    prisma.financeFacebookCampaignReportRow.findMany({ where: { business }, distinct: ["periodStart", "periodEnd"],
      orderBy: { periodEnd: "desc" }, select: { periodStart: true, periodEnd: true } }),
    prisma.financeGoogleCampaignReportRow.findMany({ where: { business }, distinct: ["periodStart", "periodEnd"],
      orderBy: { periodEnd: "desc" }, select: { periodStart: true, periodEnd: true } }),
  ]);
  const latestMonth = [...metaPeriods, ...googlePeriods]
    .filter((row) => fullSavedMonth(row.periodStart, row.periodEnd))
    .sort((a, b) => date(b.periodEnd).localeCompare(date(a.periodEnd)))[0];
  const period = latestMonth ? { start: latestMonth.periodStart, end: latestMonth.periodEnd } : null;
  const query = period ? { where: { business, periodStart: period.start, periodEnd: period.end }, select: selection } : null;
  const [metaRows, googleRows] = query ? await Promise.all([
    prisma.financeFacebookCampaignReportRow.findMany(query),
    prisma.financeGoogleCampaignReportRow.findMany(query),
  ]) : [[], []];
  const meta = completeCpl(metaRows);
  const google = completeCpl(googleRows);
  const label = period ? `${date(period.start)}–${date(period.end)}` : "any latest saved full month";
  const answer = !period
    ? `I cannot compare Meta and Google Ads cost per lead for ${business}: neither platform has a latest saved full-month campaign report. Missing reports do not mean zero leads or zero spend. [1]`
    : meta && google
      ? `For ${business}, ${label}, ${meta.cpl < google.cpl ? "Meta" : google.cpl < meta.cpl ? "Google Ads" : "Meta and Google Ads tied"} had ${meta.cpl === google.cpl ? "the same" : "the lower"} cost per lead. Meta: ${money(meta.cpl)} per lead from ${meta.leads} leads; Google Ads: ${money(google.cpl)} per lead from ${google.leads} leads. These use saved imported campaign spend divided by saved leads. [1]`
      : `I cannot compare Meta and Google Ads cost per lead for ${business}, ${label}. Meta: ${meta ? `${money(meta.cpl)} per lead from ${meta.leads} leads` : metaRows.length ? "spend or leads missing, or zero leads" : "no saved report rows"}; Google Ads: ${google ? `${money(google.cpl)} per lead from ${google.leads} leads` : googleRows.length ? "spend or leads missing, or zero leads" : "no saved report rows"}. Missing data is not zero. [1]`;
  const latestUpdate = [...metaRows, ...googleRows].reduce((at, row) => row.updatedAt > at ? row.updatedAt : at, new Date(0));
  return [{ id: `record:report:ads:cpl-comparison:${business}:${period ? date(period.start) : "none"}`,
    title: `Meta and Google Ads cost per lead: ${business}, ${label}`, kind: "record",
    url: "/marketing/ad-reporting", excerpt: answer, answer,
    updatedAt: latestUpdate.getTime() ? latestUpdate.toISOString() : new Date().toISOString(), dateKind: "entry" }];
}

function reportSource(platform: "Meta" | "Google Ads", rows: CampaignRow[], business: string,
  requested: ReturnType<typeof reportPeriod>, metric: ReturnType<typeof adMetric>): KnowledgeSource {
  const periods = [...new Map(rows.map((row) => [`${date(row.periodStart)}:${date(row.periodEnd)}`,
    { start: date(row.periodStart), end: date(row.periodEnd) }])).values()]
    .sort((a, b) => a.start.localeCompare(b.start));
  const overlap = periods.some((period, index) => index > 0 && period.start <= periods[index - 1].end);
  const span = periods.length ? `${periods[0].start} through ${periods.at(-1)!.end}` : requested?.label ?? "latest available period";
  const sums = {
    spend: rows.reduce((sum, row) => sum + (row.costCents ?? 0), 0),
    revenue: rows.reduce((sum, row) => sum + (row.revenueCents ?? 0), 0),
    leads: rows.reduce((sum, row) => sum + (row.leads ?? 0), 0),
    clicks: rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0),
    impressions: rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
    sales: rows.reduce((sum, row) => sum + (row.sales ?? 0), 0),
  };
  const needed = metric === "roas" ? ["costCents", "revenueCents"] as const
    : metric === "cpl" ? ["costCents", "leads"] as const
      : metric === "cpc" ? ["costCents", "clicks"] as const
        : metric === "ctr" ? ["clicks", "impressions"] as const
          : metric === "spend" ? ["costCents"] as const
            : metric === "revenue" ? ["revenueCents"] as const
              : metric ? [metric] as const : [];
  const missingValues = rows.some((row) => needed.some((field) => row[field] === null));
  const value = !metric || overlap || missingValues ? null
    : metric === "roas" ? sums.spend > 0 ? `${(sums.revenue / sums.spend).toFixed(2)}x` : null
      : metric === "cpl" ? sums.leads > 0 ? money(Math.round(sums.spend / sums.leads)) : null
        : metric === "cpc" ? sums.clicks > 0 ? money(Math.round(sums.spend / sums.clicks)) : null
          : metric === "ctr" ? sums.impressions > 0 ? `${(sums.clicks / sums.impressions * 100).toFixed(2)}%` : null
            : metric === "spend" ? money(sums.spend)
              : metric === "revenue" ? money(sums.revenue)
                : sums[metric].toLocaleString("en-US");
  const label = metric === "spend" ? "cost" : metric;
  const answer = overlap
    ? `I found overlapping ${platform} campaign report periods for ${span}, so I cannot safely add them into one total. [1]`
    : missingValues
      ? `I cannot verify complete ${platform} ${label ?? "campaign"} for ${span} because some imported rows have missing values. [1]`
    : value !== null
      ? `${platform} imported campaign report ${label} for ${business}, ${span}: ${value}. This covers ${periods.length} saved report period${periods.length === 1 ? "" : "s"}. [1]`
      : undefined;
  const fullMonth = periods.length === 1 && periods[0].start.endsWith("-01")
    && periods[0].end === new Date(Date.UTC(Number(periods[0].start.slice(0, 4)),
      Number(periods[0].start.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const month = fullMonth
    ? `?month=${Number(periods[0].start.slice(5, 7))}&year=${periods[0].start.slice(0, 4)}&source=${platform === "Meta" ? "meta" : "google-ads"}`
    : `?source=${platform === "Meta" ? "meta" : "google-ads"}`;
  const latest = rows.reduce((at, row) => row.updatedAt > at ? row.updatedAt : at, new Date(0));
  return {
    id: `record:report:ads:${platform}:${business}:${span}`,
    title: `${platform} imported campaign report: ${business}, ${span}`,
    kind: "record", url: `/marketing/ad-reporting${month}`,
    excerpt: [
      `Imported campaign report, ${platform}, business ${business}, period ${span}. ${rows.length} campaign rows across ${periods.length} saved report periods.`,
      overlap ? "Saved periods overlap; do not sum their rows into a single total." :
        `Sums of recorded values in these imported rows: cost ${money(sums.spend)}, revenue ${money(sums.revenue)}, leads ${sums.leads}, clicks ${sums.clicks}, impressions ${sums.impressions}, sales ${sums.sales}. Null values are missing, not zero.`,
      ...rows.slice(0, 8).map((row) => `${row.campaign}: ${date(row.periodStart)} to ${date(row.periodEnd)}; cost ${row.costCents === null ? "not recorded" : money(row.costCents)}; leads ${row.leads ?? "not recorded"}; clicks ${row.clicks ?? "not recorded"}.`),
      "These are imported campaign table values, not the separate attribution dashboard summary. Missing values are not zero.",
    ].join("\n").slice(0, 1800),
    updatedAt: latest.getTime() ? latest.toISOString() : new Date().toISOString(), dateKind: "entry", answer,
  };
}

export async function findAdReport(question: string): Promise<KnowledgeSource[]> {
  const active = await getActiveBusiness();
  const business = /\bmobile[ -]?grooming\b/i.test(question) ? "mobile-grooming"
    : /\bpet[ -]?resort\b/i.test(question) ? "pet-resort" : active.key;
  if (isAdPlatformCplComparisonQuestion(question)) return findAdPlatformCplComparison(business);
  const period = reportPeriod(question);
  const sources = /\b(?:google ads?|google)\b/i.test(question) ? ["Google Ads"] as const
    : /\b(?:meta|facebook)\b/i.test(question) ? ["Meta"] as const
      : ["Meta", "Google Ads"] as const;
  const from = period ? new Date(`${period.start}T00:00:00.000Z`) : null;
  const to = period ? new Date(`${period.end}T00:00:00.000Z`) : null;
  const metric = adMetric(question);
  const result = await Promise.all(sources.map(async (platform) => {
    const latest = period ? null : platform === "Meta"
      ? await prisma.financeFacebookCampaignReportRow.findFirst({ where: { business }, orderBy: { periodEnd: "desc" },
        select: { periodStart: true, periodEnd: true } })
      : await prisma.financeGoogleCampaignReportRow.findFirst({ where: { business }, orderBy: { periodEnd: "desc" },
        select: { periodStart: true, periodEnd: true } });
    const query = {
      where: { business, ...(period ? { periodStart: { gte: from! }, periodEnd: { lte: to! } }
        : latest ? { periodStart: latest.periodStart, periodEnd: latest.periodEnd } : {}) },
      orderBy: [{ periodStart: "asc" as const }, { rowOrder: "asc" as const }],
      select: { campaign: true, periodStart: true, periodEnd: true, clicks: true,
        costCents: true, revenueCents: true, leads: true, sales: true, impressions: true, updatedAt: true },
    };
    const rows = platform === "Meta"
      ? await prisma.financeFacebookCampaignReportRow.findMany(query)
      : await prisma.financeGoogleCampaignReportRow.findMany(query);
    return rows.length ? reportSource(platform, rows, business, period, metric) : null;
  }));
  const found = result.filter((source): source is KnowledgeSource => source !== null);
  if (found.length) return found;
  return [{
    id: `record:report:ads:missing:${business}:${period?.label ?? "latest"}`,
    title: `Campaign reports: ${business}, ${period?.label ?? "latest period"}`,
    kind: "record", url: "/marketing/ad-reporting",
    excerpt: `No imported campaign report rows are saved for ${business}, ${period?.label ?? "the latest period"}. Missing data is not zero ad spend or zero leads.`,
    updatedAt: new Date().toISOString(), dateKind: "entry",
    answer: `I cannot verify that from the imported campaign reports because no rows are saved for ${business}, ${period?.label ?? "the latest period"}. [1]`,
  }];
}
