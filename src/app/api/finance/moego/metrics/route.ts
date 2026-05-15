import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { getMoegoMetrics } from "@/lib/moego/metrics";

const ALLOWED_DAYS = new Set([7, 30, 90, 365]);
const DEFAULT_DAYS = 30;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("days");
  const parsed = raw ? Number(raw) : DEFAULT_DAYS;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : DEFAULT_DAYS;

  const metrics = await getMoegoMetrics(days);
  return NextResponse.json(metrics);
}
