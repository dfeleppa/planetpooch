import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMetaPeriodMetrics, metaInsightWhere } from "@/lib/marketing/meta-reporting";

const VALID_BUSINESSES = new Set([
  "all-businesses",
  "mobile-grooming",
  "pet-resort",
  "all-businesses-manual",
  "mobile-grooming-manual",
  "pet-resort-manual",
]);

type CampaignInputRow = {
  campaignId?: unknown;
  campaign?: unknown;
  status?: unknown;
  clicks?: unknown;
  costCents?: unknown;
  revenueCents?: unknown;
  roiPercent?: unknown;
  cpcCents?: unknown;
  ctrPercent?: unknown;
  sales?: unknown;
  cpsCents?: unknown;
  leads?: unknown;
  cplCents?: unknown;
  impressions?: unknown;
  averageRevenueCents?: unknown;
};

type ParsedCsvRow = Record<string, string>;

function canAccessAdReporting(
  user: { role?: string | null; jobTitle?: string | null } | undefined
) {
  return Boolean(user && hasMarketingAccess(user.role, user.jobTitle));
}

function dateFromParam(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanBusiness(value: string | null | undefined): string | null {
  const business = value === "" ? "all-businesses" : value;
  return business && VALID_BUSINESSES.has(business) ? business : null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function cleanNullableCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }
  const normalized = String(value).replace(/[$,%\s,]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function cleanNullablePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }
  const normalized = String(value).replace(/[$,%\s,]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function csvRowsToObjects(text: string): ParsedCsvRow[] {
  const rows = parseCsv(text);
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];

  const headers = headerRow.map((header) => header.trim());
  return dataRows.map((row) => {
    const entry: ParsedCsvRow = {};
    headers.forEach((header, index) => {
      entry[header] = row[index]?.trim() ?? "";
    });
    return entry;
  });
}

function cleanRows(rows: CampaignInputRow[]) {
  return rows.map((row, index) => ({
    rowOrder: index,
    campaignId: cleanString(row.campaignId),
    campaign: cleanString(row.campaign) ?? "(unnamed campaign)",
    status: cleanString(row.status),
    clicks: cleanNullableInt(row.clicks),
    costCents: cleanNullableCents(row.costCents),
    revenueCents: cleanNullableCents(row.revenueCents),
    roiPercent: cleanNullablePercent(row.roiPercent),
    cpcCents: cleanNullableCents(row.cpcCents),
    ctrPercent: cleanNullablePercent(row.ctrPercent),
    sales: cleanNullableInt(row.sales),
    cpsCents: cleanNullableCents(row.cpsCents),
    leads: cleanNullableInt(row.leads),
    cplCents: cleanNullableCents(row.cplCents),
    impressions: cleanNullableInt(row.impressions),
    averageRevenueCents: cleanNullableCents(row.averageRevenueCents),
  }));
}

function cleanRowsFromCsv(csvText: string) {
  return csvRowsToObjects(csvText).map((row) => ({
    campaignId: row.Id,
    campaign: row.Campaign,
    status: row.Status,
    clicks: row.Clicks,
    costCents: row.Cost,
    revenueCents: row.Revenue,
    roiPercent: row["ROI %"],
    cpcCents: row.CPC,
    ctrPercent: row.CTR,
    sales: row.Sales,
    cpsCents: row.CPS,
    leads: row.Leads,
    cplCents: row.CPL,
    impressions: row.Impressions,
    averageRevenueCents: row["Average Revenue"],
  }));
}

async function replaceRows({
  business,
  periodStart,
  periodEnd,
  rows,
}: {
  business: string;
  periodStart: Date;
  periodEnd: Date;
  rows: ReturnType<typeof cleanRows>;
}) {
  const deleteRows = prisma.financeFacebookCampaignReportRow.deleteMany({
    where: { business, periodStart, periodEnd },
  });

  if (rows.length === 0) {
    await deleteRows;
  } else {
    await prisma.$transaction([
      deleteRows,
      prisma.financeFacebookCampaignReportRow.createMany({
        data: rows.map((row) => ({
          business,
          periodStart,
          periodEnd,
          ...row,
        })),
      }),
    ]);
  }

  return prisma.financeFacebookCampaignReportRow.findMany({
    where: { business, periodStart, periodEnd },
    orderBy: { rowOrder: "asc" },
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (
    !canAccessAdReporting(
      session?.user as { role?: string | null; jobTitle?: string | null } | undefined
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const business = cleanBusiness(req.nextUrl.searchParams.get("business"));
  const periodStart = dateFromParam(req.nextUrl.searchParams.get("from"));
  const periodEnd = dateFromParam(req.nextUrl.searchParams.get("to"));

  if (!business || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "business, from, and to are required." },
      { status: 400 }
    );
  }

  const insightRows = await prisma.metaAdInsight.findMany({
    where: await metaInsightWhere(
      business.replace(/-manual$/, "").replace("all-businesses", ""),
      periodStart,
      new Date(periodEnd.getTime() + 86_400_000),
    ),
    select: { campaignId: true, campaignName: true, spendCents: true, purchaseValueCents: true, purchases: true, leads: true, linkClicks: true, impressions: true },
  });
  const grouped = new Map<string, { campaignId: string; campaign: string; costCents: number; revenueCents: number; sales: number; leads: number; clicks: number; impressions: number }>();
  for (const row of insightRows) {
    const id = row.campaignId ?? row.campaignName ?? "unknown";
    const item = grouped.get(id) ?? { campaignId: id, campaign: row.campaignName ?? id, costCents: 0, revenueCents: 0, sales: 0, leads: 0, clicks: 0, impressions: 0 };
    item.costCents += row.spendCents;
    item.revenueCents += row.purchaseValueCents;
    item.sales += row.purchases;
    item.leads += row.leads;
    item.clicks += row.linkClicks;
    item.impressions += row.impressions;
    grouped.set(id, item);
  }
  const rows = [...grouped.values()].map((row) => ({
    ...row,
    id: row.campaignId,
    status: null,
    roiPercent: row.costCents > 0 ? Math.round(row.revenueCents / row.costCents * 10000) : null,
    cpcCents: row.clicks > 0 ? Math.round(row.costCents / row.clicks) : null,
    ctrPercent: row.impressions > 0 ? Math.round(row.clicks / row.impressions * 10000) : null,
    cpsCents: row.sales > 0 ? Math.round(row.costCents / row.sales) : null,
    cplCents: row.leads > 0 ? Math.round(row.costCents / row.leads) : null,
    averageRevenueCents: row.sales > 0 ? Math.round(row.revenueCents / row.sales) : null,
  })).sort((a, b) => b.costCents - a.costCents);

  const coverage = await getMetaPeriodMetrics(
    business.replace(/-manual$/, "").replace("all-businesses", ""),
    periodStart,
    new Date(periodEnd.getTime() + 86_400_000),
  );
  return NextResponse.json({ rows, complete: coverage.complete, through: coverage.through });
}

export async function PUT() {
  return NextResponse.json({ error: 'Meta campaign metrics are synced from the Meta API.' }, { status: 405 });
}

export async function POST() {
  return NextResponse.json({ error: 'Meta campaign metrics are synced from the Meta API.' }, { status: 405 });
}
