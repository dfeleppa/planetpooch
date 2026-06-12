import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import {
  fetchAllOpportunities,
  GhlApiError,
  GhlConfigError,
  GhlOpportunity,
} from "@/lib/ghl/client";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

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

function statusBucket(status: string): "open" | "won" | "lost" | "abandoned" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "won") return "won";
  if (normalized === "lost") return "lost";
  if (normalized === "abandoned") return "abandoned";
  return "open";
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalSource(source: string): string {
  const normalized = normalizeText(source);
  if (!normalized) return "-";

  const lower = normalized.toLocaleLowerCase("en-US");
  if (lower === "meta ads" || lower === "facebook" || lower === "instagram") {
    return "meta ads";
  }
  if (lower === "website") return "website";
  if (lower === "website getting started form") return "website getting started form";
  return normalized;
}

function sourceKey(source: string): string {
  return canonicalSource(source).toLocaleLowerCase("en-US");
}

function attributionValues(opportunity: GhlOpportunity): string[] {
  return opportunity.attributions.flatMap((attribution) =>
    [
      attribution.adSource,
      attribution.utmCampaign,
      attribution.utmContent,
      attribution.utmMedium,
      attribution.utmSessionSource,
      attribution.utmSource,
    ].flatMap((value) => (value ? [value] : []))
  );
}

function reportSource(opportunity: GhlOpportunity): string {
  const values = attributionValues(opportunity).map((value) =>
    normalizeText(value).toLocaleLowerCase("en-US")
  );

  if (
    values.some(
      (value) =>
        value === "meta ads" ||
        value === "facebook" ||
        value === "instagram" ||
        value.includes("facebook") ||
        value.includes("instagram") ||
        value.includes("meta")
    )
  ) {
    return "meta ads";
  }

  if (
    values.some(
      (value) =>
        value === "website" ||
        value.includes("planet-pooch.com") ||
        value.includes("planetpooch.com")
    )
  ) {
    return "website";
  }

  return canonicalSource(opportunity.source);
}

async function buildRowsFromGhl({
  business,
  periodStart,
  periodEnd,
}: {
  business: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  const toExclusive = new Date(periodEnd);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  const [opportunities, serviceRows] = await Promise.all([
    fetchAllOpportunities(),
    prisma.ghlOpportunityService.findMany(),
  ]);
  const serviceMap = new Map<string, string>();
  for (const row of serviceRows) serviceMap.set(row.opportunityId, row.service);

  const fromMs = periodStart.getTime();
  const toMs = toExclusive.getTime();
  const groups = new Map<
    string,
    {
      source: string;
      totalLeads: number;
      totalValueCents: number;
      open: number;
      won: number;
      lost: number;
      abandoned: number;
    }
  >();

  for (const opportunity of opportunities) {
    const createdMs = new Date(opportunity.createdAt).getTime();
    if (Number.isNaN(createdMs) || createdMs < fromMs || createdMs >= toMs) {
      continue;
    }

    const service = serviceMap.get(opportunity.id) ?? null;
    if (business === "mobile-grooming" && service !== "mobile") continue;
    if (business === "pet-resort" && service !== "resort") continue;

    const source = reportSource(opportunity);
    const key = sourceKey(source);
    const group = groups.get(key) ?? {
      source,
      totalLeads: 0,
      totalValueCents: 0,
      open: 0,
      won: 0,
      lost: 0,
      abandoned: 0,
    };
    const bucket = statusBucket(opportunity.status);

    group.totalLeads += 1;
    if (bucket === "won") {
      group.totalValueCents += Math.round((opportunity.monetaryValue ?? 0) * 100);
    }
    group[bucket] += 1;
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.totalValueCents - a.totalValueCents || a.source.localeCompare(b.source))
    .map((row, index) => ({ ...row, rowOrder: index }));
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

export async function POST(req: NextRequest) {
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
      }
    | null;

  const business = cleanBusiness(body?.business ?? null);
  const reportType = cleanReportType(body?.reportType ?? null);
  const periodStart = dateFromParam(body?.periodStart ?? null);
  const periodEnd = dateFromParam(body?.periodEnd ?? null);

  if (!business || !reportType || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "business, periodStart, periodEnd, and reportType are required." },
      { status: 400 }
    );
  }

  try {
    const rows = await buildRowsFromGhl({ business, periodStart, periodEnd });

    const writes = [
      prisma.financeLeadSourceReportRow.deleteMany({
        where: { business, reportType, periodStart, periodEnd },
      }),
    ];
    if (rows.length > 0) {
      writes.push(
        prisma.financeLeadSourceReportRow.createMany({
          data: rows.map((row) => ({
            business,
            reportType,
            periodStart,
            periodEnd,
            ...row,
          })),
        })
      );
    }

    await prisma.$transaction(writes);

    const savedRows = await prisma.financeLeadSourceReportRow.findMany({
      where: { business, reportType, periodStart, periodEnd },
      orderBy: { rowOrder: "asc" },
    });

    return NextResponse.json({ rows: savedRows });
  } catch (e) {
    if (e instanceof GhlConfigError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    if (e instanceof GhlApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
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
