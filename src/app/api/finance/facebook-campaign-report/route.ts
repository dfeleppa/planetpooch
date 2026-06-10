import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

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

function isSuperAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
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
  if (!session?.user || !isSuperAdmin((session.user as { role: string }).role)) {
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

  const rows = await prisma.financeFacebookCampaignReportRow.findMany({
    where: { business, periodStart, periodEnd },
    orderBy: { rowOrder: "asc" },
  });

  return NextResponse.json({ rows });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        business?: string;
        periodStart?: string;
        periodEnd?: string;
        rows?: CampaignInputRow[];
      }
    | null;

  const business = cleanBusiness(body?.business);
  const periodStart = dateFromParam(body?.periodStart);
  const periodEnd = dateFromParam(body?.periodEnd);

  if (!business || !periodStart || !periodEnd || !Array.isArray(body?.rows)) {
    return NextResponse.json(
      { error: "business, periodStart, periodEnd, and rows are required." },
      { status: 400 }
    );
  }

  const rows = await replaceRows({
    business,
    periodStart,
    periodEnd,
    rows: cleanRows(body.rows),
  });

  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const business = cleanBusiness(form?.get("business")?.toString());
  const periodStart = dateFromParam(form?.get("periodStart")?.toString());
  const periodEnd = dateFromParam(form?.get("periodEnd")?.toString());
  const file = form?.get("file");

  if (
    !business ||
    !periodStart ||
    !periodEnd ||
    !file ||
    typeof file === "string" ||
    typeof file.text !== "function"
  ) {
    return NextResponse.json(
      { error: "business, periodStart, periodEnd, and CSV file are required." },
      { status: 400 }
    );
  }

  const csvText = await file.text();
  const rows = await replaceRows({
    business,
    periodStart,
    periodEnd,
    rows: cleanRows(cleanRowsFromCsv(csvText)),
  });

  return NextResponse.json({ rows });
}
