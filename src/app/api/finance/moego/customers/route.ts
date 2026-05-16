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
  createdTime: Date;
  orderCount: bigint;
  revenueCents: bigint;
  lastOrderTime: Date | null;
};

type Sort = "ltv" | "recent" | "created";
const SORT_VALUES: ReadonlySet<Sort> = new Set(["ltv", "recent", "created"]);

/**
 * Per-customer detail for /finance/moego. Returns one row per customer
 * with their lifetime order count, revenue (sum of paidCents), and last
 * order date. Aggregated in a single GROUP BY so we can sort by LTV and
 * paginate without computing every customer's revenue on every request.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.min(Math.max(1, Number(sp.get("page") ?? 1)), MAX_PAGE);
  const search = sp.get("search")?.trim() ?? "";
  const sortRaw = sp.get("sort") ?? "ltv";
  const sort: Sort = (SORT_VALUES as Set<string>).has(sortRaw)
    ? (sortRaw as Sort)
    : "ltv";

  const offset = (page - 1) * PAGE_SIZE;
  const like = search ? `%${search}%` : null;

  // Build the WHERE clause conditionally — empty search returns every
  // customer, otherwise case-insensitive LIKE across name/email/phone.
  const where = like
    ? Prisma.sql`WHERE (
        lower(c."name") LIKE lower(${like})
        OR lower(c."email") LIKE lower(${like})
        OR c."mainPhoneNumber" LIKE ${like}
      )`
    : Prisma.empty;

  // ORDER BY varies; keep all three sorts deterministic by tie-breaking
  // on moegoId.
  const orderBy =
    sort === "recent"
      ? Prisma.sql`ORDER BY "lastOrderTime" DESC NULLS LAST, c."moegoId" ASC`
      : sort === "created"
        ? Prisma.sql`ORDER BY c."createdTime" DESC, c."moegoId" ASC`
        : Prisma.sql`ORDER BY "revenueCents" DESC NULLS LAST, c."moegoId" ASC`;

  const rows = await prisma.$queryRaw<CustomerRow[]>`
    SELECT
      c."moegoId",
      c."name",
      c."email",
      c."mainPhoneNumber",
      c."leadSource",
      c."createdTime",
      COUNT(o."id")              AS "orderCount",
      COALESCE(SUM(o."paidCents"), 0) AS "revenueCents",
      MAX(o."createdTime")       AS "lastOrderTime"
    FROM "MoegoCustomer" c
    LEFT JOIN "MoegoOrder" o ON o."customerMoegoId" = c."moegoId"
    ${where}
    GROUP BY c."id"
    ${orderBy}
    LIMIT ${PAGE_SIZE}
    OFFSET ${offset}
  `;

  const totalRow = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total
    FROM "MoegoCustomer" c
    ${where}
  `;
  const total = Number(totalRow[0]?.total ?? 0);

  return NextResponse.json({
    rows: rows.map((r) => ({
      moegoId: r.moegoId,
      name: r.name,
      email: r.email,
      mainPhoneNumber: r.mainPhoneNumber,
      leadSource: r.leadSource,
      createdTime: r.createdTime,
      orderCount: Number(r.orderCount),
      revenueCents: Number(r.revenueCents),
      lastOrderTime: r.lastOrderTime,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    sort,
  });
}
