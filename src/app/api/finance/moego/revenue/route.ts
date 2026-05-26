import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

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
 * We bucket by `createdTime` (when the invoice opened) rather than
 * `salesDatetime` (when payment cleared) so partial-paid / open
 * invoices still appear on the day they're opened.
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
  const to = parseDate(sp.get("to")) ?? now;
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
        date_trunc(${bucketLit}, "createdTime") AS bucket,
        COALESCE(SUM("paidCents"), 0)::bigint AS "revenueCents",
        COUNT(*)::bigint AS orders
      FROM "MoegoOrder"
      WHERE "createdTime" >= ${from}
        AND "createdTime" <  ${to}
        AND "businessId" = ${business}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const totalRow = await prisma.$queryRaw<
      { revenueCents: bigint; orders: bigint }[]
    >`
      SELECT
        COALESCE(SUM("paidCents"), 0)::bigint AS "revenueCents",
        COUNT(*)::bigint AS orders
      FROM "MoegoOrder"
      WHERE "createdTime" >= ${from}
        AND "createdTime" <  ${to}
        AND "businessId" = ${business}
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
