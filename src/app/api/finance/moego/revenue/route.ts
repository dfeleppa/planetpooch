import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

type Range = "7d" | "30d" | "90d" | "365d" | "730d" | "all";
type Bucket = "day" | "week" | "month";

const RANGE_VALUES: ReadonlySet<Range> = new Set([
  "7d",
  "30d",
  "90d",
  "365d",
  "730d",
  "all",
]);

/**
 * Picked so each range produces 7–60 buckets — enough resolution to see
 * shape, few enough that a plain inline SVG bar chart is readable.
 */
const RANGE_BUCKET: Record<Range, Bucket> = {
  "7d": "day",
  "30d": "day",
  "90d": "day",
  "365d": "week",
  "730d": "month",
  all: "month",
};

const RANGE_DAYS: Record<Range, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
  "730d": 730,
  all: null,
};

type RawRow = {
  bucket: Date;
  revenueCents: bigint;
  orders: bigint;
};

/**
 * Per-bucket order revenue and count for /finance/moego's chart.
 *
 * We bucket by `createdTime` (when the invoice opened) rather than
 * `salesDatetime` (when payment cleared) so partial-paid / open
 * invoices still appear on the day they're opened. `salesDatetime` is
 * nullable on legacy rows; `createdTime` is required on every row.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rangeRaw = req.nextUrl.searchParams.get("range") ?? "30d";
  const range: Range = (RANGE_VALUES as Set<string>).has(rangeRaw)
    ? (rangeRaw as Range)
    : "30d";
  const bucket = RANGE_BUCKET[range];
  const days = RANGE_DAYS[range];

  // date_trunc returns a TIMESTAMP at the start of the bucket; we cast
  // to date for stable JSON serialization.
  const truncSql = Prisma.sql`date_trunc(${bucket}, "createdTime")`;
  const where = days
    ? Prisma.sql`WHERE "createdTime" >= now() - (${days}::int * INTERVAL '1 day')`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      ${truncSql} AS bucket,
      COALESCE(SUM("paidCents"), 0)::bigint AS "revenueCents",
      COUNT(*)::bigint AS orders
    FROM "MoegoOrder"
    ${where}
    GROUP BY ${truncSql}
    ORDER BY ${truncSql} ASC
  `;

  const totalRow = await prisma.$queryRaw<
    { revenueCents: bigint; orders: bigint }[]
  >`
    SELECT
      COALESCE(SUM("paidCents"), 0)::bigint AS "revenueCents",
      COUNT(*)::bigint AS orders
    FROM "MoegoOrder"
    ${where}
  `;

  return NextResponse.json({
    range,
    bucket,
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
}
