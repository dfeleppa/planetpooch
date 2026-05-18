import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { getMoegoMetrics } from "@/lib/moego/metrics";

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
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

  const metrics = await getMoegoMetrics({ from, to });
  return NextResponse.json(metrics);
}
