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

const VALID_REPORT_TYPES = new Set(["sales"]);

type LeadSourceInputRow = {
  source?: unknown;
  totalLeads?: unknown;
  totalValueCents?: unknown;
  open?: unknown;
  won?: unknown;
  lost?: unknown;
  abandoned?: unknown;
};

function isSuperAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

function dateFromParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanBusiness(value: string | null): string | null {
  const business = value === "" ? "all-businesses" : value;
  return business && VALID_BUSINESSES.has(business) ? business : null;
}

function cleanReportType(value: string | null): string | null {
  const reportType = value || "sales";
  return VALID_REPORT_TYPES.has(reportType) ? reportType : null;
}

function cleanNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function cleanRows(rows: LeadSourceInputRow[]) {
  return rows.map((row, index) => ({
    rowOrder: index,
    source:
      typeof row.source === "string" && row.source.trim()
        ? row.source.trim()
        : "-",
    totalLeads: cleanNullableInt(row.totalLeads),
    totalValueCents: cleanNullableInt(row.totalValueCents),
    open: cleanNullableInt(row.open),
    won: cleanNullableInt(row.won),
    lost: cleanNullableInt(row.lost),
    abandoned: cleanNullableInt(row.abandoned),
  }));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const business = cleanBusiness(req.nextUrl.searchParams.get("business"));
  const reportType = cleanReportType(req.nextUrl.searchParams.get("reportType"));
  const periodStart = dateFromParam(req.nextUrl.searchParams.get("from"));
  const periodEnd = dateFromParam(req.nextUrl.searchParams.get("to"));

  if (!business || !reportType || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "business, reportType, from, and to are required." },
      { status: 400 }
    );
  }

  const rows = await prisma.financeLeadSourceReportRow.findMany({
    where: { business, reportType, periodStart, periodEnd },
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
        reportType?: string;
        rows?: LeadSourceInputRow[];
      }
    | null;

  const business = cleanBusiness(body?.business ?? null);
  const reportType = cleanReportType(body?.reportType ?? null);
  const periodStart = dateFromParam(body?.periodStart ?? null);
  const periodEnd = dateFromParam(body?.periodEnd ?? null);

  if (!business || !reportType || !periodStart || !periodEnd || !Array.isArray(body?.rows)) {
    return NextResponse.json(
      { error: "business, periodStart, periodEnd, reportType, and rows are required." },
      { status: 400 }
    );
  }

  const rows = cleanRows(body.rows);

  await prisma.$transaction([
    prisma.financeLeadSourceReportRow.deleteMany({
      where: { business, reportType, periodStart, periodEnd },
    }),
    prisma.financeLeadSourceReportRow.createMany({
      data: rows.map((row) => ({
        business,
        reportType,
        periodStart,
        periodEnd,
        ...row,
      })),
    }),
  ]);

  const savedRows = await prisma.financeLeadSourceReportRow.findMany({
    where: { business, reportType, periodStart, periodEnd },
    orderBy: { rowOrder: "asc" },
  });

  return NextResponse.json({ rows: savedRows });
}
