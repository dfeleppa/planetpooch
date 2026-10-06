import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function day(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let input: unknown;
  try { input = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const body = input as Record<string, unknown>;
  const from = day(body.from);
  const to = day(body.to);
  const source = body.source;
  const amount = body.amount;
  if (!from || !to || from > to || (source !== "google-ads" && source !== "google-lsa") ||
      typeof amount !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount) || Number(amount) > 21474836.47) {
    return NextResponse.json({ error: "Enter a valid nonnegative dollar amount and date range." }, { status: 400 });
  }
  const amountCents = Math.round(Number(amount) * 100);
  const saved = await prisma.marketingManualSpend.upsert({
    where: { business_source_periodStart_periodEnd: { business: "combined", source, periodStart: from, periodEnd: to } },
    create: { business: "combined", source, periodStart: from, periodEnd: to, amountCents },
    update: { amountCents },
  });
  return NextResponse.json({ amountCents: saved.amountCents, updatedAt: saved.updatedAt });
}
