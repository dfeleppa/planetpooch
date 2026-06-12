import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";

type Bucket = "day" | "week" | "month" | "quarter" | "year";

const BUCKET_VALUES: ReadonlySet<Bucket> = new Set([
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);

/**
 * Auto-pick bucket granularity from the span length when the caller
 * doesn't specify one. Aim for ~10–60 buckets so the chart is readable
 * without scrolling.
 */
function autoBucket(spanDays: number): Bucket {
  if (spanDays <= 60) return "day";
  if (spanDays <= 180) return "week";
  if (spanDays <= 730) return "month";
  if (spanDays <= 3650) return "quarter";
  return "year";
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

type RawRow = {
  bucket: Date;
  revenueCents: bigint;
  orders: bigint;
};

/**
 * Per-bucket order revenue and count for /finance/moego's chart.
 *
 * Params:
 *   from   YYYY-MM-DD (optional, defaults to 30 days ago)
 *   to     YYYY-MM-DD (optional, defaults to today)
 *   bucket day|week|month|quarter|year (optional, auto-picks from span)
 *
 * Revenue is "net sales" = subtotal − discounts (excludes tax & tips),
 * bucketed by when the sale landed (salesDatetime → completedTime →
 * createdTime) and scoped to revenue-bearing statuses, so the chart
 * matches the KPI tiles and MoeGo's sales report.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const business = sp.get("business");
  if (!business) {
    return NextResponse.json({ error: "`business` is required." }, { status: 400 });
  }
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(sp.get("from")) ?? defaultFrom;
  const toParam = parseDate(sp.get("to"));
  const to = toParam ? addUtcDays(toParam, 1) : now;
  if (from >= to) {
    return NextResponse.json(
      { error: "`from` must be before `to`." },
      { status: 400 }
    );
  }

  const bucketRaw = sp.get("bucket") ?? "auto";
  const spanDays = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
  );
  const bucket: Bucket =
    bucketRaw !== "auto" && (BUCKET_VALUES as Set<string>).has(bucketRaw)
      ? (bucketRaw as Bucket)
      : autoBucket(spanDays);

  // bucket is allowlisted above, so it's safe to inline as a literal.
  // We splice via Prisma.raw to avoid the bind-parameter-equality issue
  // that breaks GROUP BY when the same fragment is interpolated twice.
  const bucketLit = Prisma.raw(`'${bucket}'`);

  try {
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        date_trunc(${bucketLit}, COALESCE("salesDatetime", "completedTime", "createdTime")) AS bucket,
        COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "revenueCents",
        COUNT(*)::bigint AS orders
      FROM "MoegoOrder"
      WHERE COALESCE("salesDatetime", "completedTime", "createdTime") >= ${from}
        AND COALESCE("salesDatetime", "completedTime", "createdTime") <  ${to}
        AND "businessId" = ${business}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const totalRow = await prisma.$queryRaw<
      { revenueCents: bigint; orders: bigint }[]
    >`
      SELECT
        COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "revenueCents",
        COUNT(*)::bigint AS orders
      FROM "MoegoOrder"
      WHERE COALESCE("salesDatetime", "completedTime", "createdTime") >= ${from}
        AND COALESCE("salesDatetime", "completedTime", "createdTime") <  ${to}
        AND "businessId" = ${business}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
    `;

    return NextResponse.json({
      from,
      to,
      bucket,
      autoBucket: bucketRaw === "auto",
      buckets: rows.map((r) => ({
        date: r.bucket,
        revenueCents: Number(r.revenueCents),
        orders: Number(r.orders),
      })),
      total: {
        revenueCents: Number(totalRow[0]?.revenueCents ?? 0),
        orders: Number(totalRow[0]?.orders ?? 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("MoeGo revenue query failed:", err);
    return NextResponse.json(
      { error: `Revenue query failed: ${message}` },
      { status: 500 }
    );
  }
}
