import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { csvUploadError, MAX_LSA_CSV_BYTES } from "@/lib/csv-upload";
import { getGoogleLsaLeads, GOOGLE_LSA_LEAD_COST_CENTS } from "@/lib/marketing/google-lsa-leads";

const VALID_BUSINESSES = new Set([
  "all-businesses",
  "mobile-grooming",
  "pet-resort",
  "all-businesses-manual",
  "mobile-grooming-manual",
  "pet-resort-manual",
]);
const MAX_ROWS = 5_000;

type ParsedCsvRow = Record<string, string>;

function canAccessAdReporting(
  user: { role?: string | null; jobTitle?: string | null } | undefined
) {
  return Boolean(user && hasMarketingAccess(user.role, user.jobTitle));
}

function dateFromParam(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function cleanBusiness(value: string | null | undefined): string | null {
  const business = value === "" ? "all-businesses" : value;
  return business && VALID_BUSINESSES.has(business) ? business : null;
}

function cleanString(value: string | undefined): string | null {
  return value?.trim() || null;
}

function cleanCents(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
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
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function csvRowsToObjects(text: string): ParsedCsvRow[] {
  const [headerRow, ...dataRows] = parseCsv(text);
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

function cleanRows(csvText: string) {
  return csvRowsToObjects(csvText).map((row, rowOrder) => ({
    rowOrder,
    customer: cleanString(row.Customer),
    jobType: cleanString(row["Job type"]),
    searchIntent: cleanString(row["Search intent"]),
    location: cleanString(row.Location),
    leadType: cleanString(row["Lead type"]),
    chargeStatus: cleanString(row["Charge status"]),
    leadReceived: cleanString(row["Lead received"]),
    lastActivity: cleanString(row["Last activity"]),
    totalPaidCents: cleanCents(row["Total paid"]),
  })).filter((row) => row.customer || row.jobType || row.searchIntent || row.location || row.leadType || row.chargeStatus || row.leadReceived || row.lastActivity || row.totalPaidCents !== null);
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

  if (!business || !periodStart || !periodEnd || periodStart > periodEnd) {
    return NextResponse.json(
      { error: "business, from, and to are required." },
      { status: 400 }
    );
  }

  const rows = (await getGoogleLsaLeads([business], periodStart, periodEnd))
    .map((row) => ({ ...row, leadCostCents: GOOGLE_LSA_LEAD_COST_CENTS }));

  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (
    !canAccessAdReporting(
      session?.user as { role?: string | null; jobTitle?: string | null } | undefined
    )
  ) {
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

  const uploadError = csvUploadError(file, MAX_LSA_CSV_BYTES);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: file.size > MAX_LSA_CSV_BYTES ? 413 : 400 });

  const rows = cleanRows(await file.text());
  if (rows.length === 0 || rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `CSV must contain between 1 and ${MAX_ROWS.toLocaleString()} rows.` },
      { status: 400 }
    );
  }

  const deleteRows = prisma.financeGoogleLsaLeadReportRow.deleteMany({
    where: { business, periodStart, periodEnd },
  });
  await prisma.$transaction([
    deleteRows,
    prisma.financeGoogleLsaLeadReportRow.createMany({
      data: rows.map((row) => ({ business, periodStart, periodEnd, ...row })),
    }),
  ]);

  const savedRows = await prisma.financeGoogleLsaLeadReportRow.findMany({
    where: { business, periodStart, periodEnd },
    orderBy: { rowOrder: "asc" },
  });

  return NextResponse.json({ rows: savedRows });
}
