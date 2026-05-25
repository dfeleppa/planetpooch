import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;
const MAX_PAGE = 1000;

type CustomerRow = {
  moegoId: string;
  name: string | null;
  email: string | null;
  mainPhoneNumber: string | null;
  leadSource: string | null;
  preferredBusinessId: string | null;
  lastAppointmentDate: Date | null;
  tags: string[];
  createdTime: Date;
  orderCount: bigint;
  revenueCents: bigint;
  lastOrderTime: Date | null;
};

type Sort =
  | "name"
  | "leadSource"
  | "created"
  | "orders"
  | "ltv"
  | "lastOrder";
type Dir = "asc" | "desc";

const SORT_VALUES: ReadonlySet<Sort> = new Set([
  "name",
  "leadSource",
  "created",
  "orders",
  "ltv",
  "lastOrder",
]);
const DIR_VALUES: ReadonlySet<Dir> = new Set(["asc", "desc"]);

/**
 * Default direction for each column — picked so the first click "does
 * the obvious thing" (highest revenue first, alphabetical names, etc).
 */
const DEFAULT_DIR: Record<Sort, Dir> = {
  name: "asc",
  leadSource: "asc",
  created: "desc",
  orders: "desc",
  ltv: "desc",
  lastOrder: "desc",
};

/**
 * Per-customer detail for /finance/moego. Returns one row per customer
 * with their lifetime order count, revenue (sum of paidCents), and last
 * order date. Aggregated in a single GROUP BY so we can sort by any
 * column and paginate without computing every customer's revenue on
 * every request.
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
  const page = Math.min(Math.max(1, Number(sp.get("page") ?? 1)), MAX_PAGE);
  const search = sp.get("search")?.trim() ?? "";
  const sortRaw = sp.get("sort") ?? "ltv";
  const sort: Sort = (SORT_VALUES as Set<string>).has(sortRaw)
    ? (sortRaw as Sort)
    : "ltv";
  const dirRaw = sp.get("dir");
  const dir: Dir =
    dirRaw && (DIR_VALUES as Set<string>).has(dirRaw)
      ? (dirRaw as Dir)
      : DEFAULT_DIR[sort];

  // Optional acquisition window — when set, only customers created
  // between [from, to) are returned. Used by the page-wide date range
  // picker so the table reflects the same cohort as the KPI tiles.
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const fromDate = fromRaw ? new Date(fromRaw) : null;
  const toDate = toRaw ? new Date(toRaw) : null;
  const hasDateFilter =
    fromDate && toDate && !Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime());

  const offset = (page - 1) * PAGE_SIZE;
  const like = search ? `%${search}%` : null;

  // Build the WHERE clause conditionally. Combine search + date filter
  // when both are present.
  const searchClause = like
    ? Prisma.sql`(
        lower(c."name") LIKE lower(${like})
        OR lower(c."email") LIKE lower(${like})
        OR c."mainPhoneNumber" LIKE ${like}
      )`
    : null;
  const dateClause = hasDateFilter
    ? Prisma.sql`c."createdTime" >= ${fromDate} AND c."createdTime" < ${toDate}`
    : null;
  const where =
    searchClause && dateClause
      ? Prisma.sql`WHERE ${searchClause} AND ${dateClause}`
      : searchClause
        ? Prisma.sql`WHERE ${searchClause}`
        : dateClause
          ? Prisma.sql`WHERE ${dateClause}`
          : Prisma.empty;

  // ORDER BY: pick the column, apply the direction, NULLS-LAST when
  // descending so empty rows don't crowd the top. Tie-break on moegoId
  // for deterministic paging.
  const dirSql = dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const nullsSql =
    dir === "asc" ? Prisma.sql`NULLS FIRST` : Prisma.sql`NULLS LAST`;
  const orderBy = (() => {
    switch (sort) {
      case "name":
        return Prisma.sql`ORDER BY lower(c."name") ${dirSql} ${nullsSql}, c."moegoId" ASC`;
      case "leadSource":
        return Prisma.sql`ORDER BY c."leadSource" ${dirSql} ${nullsSql}, c."moegoId" ASC`;
      case "created":
        return Prisma.sql`ORDER BY c."createdTime" ${dirSql}, c."moegoId" ASC`;
      case "orders":
        return Prisma.sql`ORDER BY "orderCount" ${dirSql}, c."moegoId" ASC`;
      case "lastOrder":
        return Prisma.sql`ORDER BY "lastOrderTime" ${dirSql} ${nullsSql}, c."moegoId" ASC`;
      case "ltv":
      default:
        return Prisma.sql`ORDER BY "revenueCents" ${dirSql} ${nullsSql}, c."moegoId" ASC`;
    }
  })();

  const rows = await prisma.$queryRaw<CustomerRow[]>`
    SELECT
      c."moegoId",
      c."name",
      c."email",
      c."mainPhoneNumber",
      c."leadSource",
      c."preferredBusinessId",
      c."lastAppointmentDate",
      c."tags",
      c."createdTime",
      COUNT(o."id")              AS "orderCount",
      COALESCE(SUM(o."paidCents"), 0) AS "revenueCents",
      MAX(o."createdTime")       AS "lastOrderTime"
    FROM "MoegoCustomer" c
    JOIN "MoegoOrder" o ON o."customerMoegoId" = c."moegoId" AND o."businessId" = ${business}
    ${where}
    GROUP BY c."id"
    ${orderBy}
    LIMIT ${PAGE_SIZE}
    OFFSET ${offset}
  `;

  const totalRow = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total FROM (
      SELECT c."id"
      FROM "MoegoCustomer" c
      JOIN "MoegoOrder" o ON o."customerMoegoId" = c."moegoId" AND o."businessId" = ${business}
      ${where}
      GROUP BY c."id"
    ) t
  `;
  const total = Number(totalRow[0]?.total ?? 0);

  return NextResponse.json({
    rows: rows.map((r) => ({
      moegoId: r.moegoId,
      name: r.name,
      email: r.email,
      mainPhoneNumber: r.mainPhoneNumber,
      leadSource: r.leadSource,
      preferredBusinessId: r.preferredBusinessId,
      lastAppointmentDate: r.lastAppointmentDate,
      tags: r.tags ?? [],
      createdTime: r.createdTime,
      orderCount: Number(r.orderCount),
      revenueCents: Number(r.revenueCents),
      lastOrderTime: r.lastOrderTime,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    sort,
    dir,
  });
}
