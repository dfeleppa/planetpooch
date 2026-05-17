import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * Full record for a single MoeGo customer: the customer fields, every
 * order (newest first), and the matched lead (if any). The lead match
 * is by phone number — MoeGo doesn't preserve the lead→customer linkage
 * on promote, so this is best-effort.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ moegoId: string }> }
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moegoId } = await params;

  const customer = await prisma.moegoCustomer.findUnique({
    where: { moegoId },
  });
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [orders, matchedLead] = await Promise.all([
    prisma.moegoOrder.findMany({
      where: { customerMoegoId: moegoId },
      orderBy: { createdTime: "desc" },
    }),
    customer.mainPhoneNumber
      ? prisma.moegoLead.findFirst({
          where: { mainPhoneNumber: customer.mainPhoneNumber },
          orderBy: { createdTime: "asc" },
        })
      : null,
  ]);

  // Cheap aggregates derived from the order list — avoids a second
  // GROUP BY round trip for what's already in memory.
  const totalPaidCents = orders.reduce((s, o) => s + o.paidCents, 0);
  const totalRefundedCents = orders.reduce((s, o) => s + o.refundedCents, 0);
  const totalInvoicedCents = orders.reduce((s, o) => s + o.totalCents, 0);

  return NextResponse.json({
    customer,
    orders,
    matchedLead,
    aggregates: {
      orderCount: orders.length,
      totalPaidCents,
      totalRefundedCents,
      totalInvoicedCents,
      avgOrderCents:
        orders.length > 0 ? Math.round(totalPaidCents / orders.length) : 0,
      firstOrderTime: orders.length > 0 ? orders[orders.length - 1].createdTime : null,
      lastOrderTime: orders.length > 0 ? orders[0].createdTime : null,
    },
  });
}
