import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import {
  fetchAllOpportunities,
  GhlApiError,
  GhlConfigError,
  GhlOpportunity,
} from "@/lib/ghl/client";

export const maxDuration = 120;

type OpportunityData = Pick<
  GhlOpportunity,
  | "id"
  | "name"
  | "monetaryValue"
  | "status"
  | "source"
  | "createdAt"
  | "attributions"
>;

type CachedData = {
  opportunities: OpportunityData[];
  total: number;
  cachedAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;
let cache: CachedData | null = null;

function parseDateParam(
  value: string | null,
  name: string,
  boundary: "start" | "end",
): { date: Date | null; error?: string } {
  if (!value) return { date: null };
  if (!DATE_PARAM_RE.test(value)) {
    return { date: null, error: `${name} must be a YYYY-MM-DD date.` };
  }

  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return { date: null, error: `${name} must be a valid date.` };
  }

  if (boundary === "end") {
    return { date: new Date(Date.UTC(year, month - 1, day + 1)) };
  }

  return { date: start };
}

function filterByCreatedDate(
  opportunities: OpportunityData[],
  from: Date | null,
  toExclusive: Date | null,
): OpportunityData[] {
  if (!from && !toExclusive) return opportunities;

  const fromMs = from?.getTime() ?? Number.NEGATIVE_INFINITY;
  const toMs = toExclusive?.getTime() ?? Number.POSITIVE_INFINITY;

  return opportunities.filter((o) => {
    const createdMs = new Date(o.createdAt).getTime();
    return (
      !Number.isNaN(createdMs) &&
      createdMs >= fromMs &&
      createdMs < toMs
    );
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const forceRefresh = sp.get("refresh") === "1";
  const from = parseDateParam(sp.get("from"), "from", "start");
  const toExclusive = parseDateParam(sp.get("to"), "to", "end");

  if (from.error) {
    return NextResponse.json({ error: from.error }, { status: 400 });
  }
  if (toExclusive.error) {
    return NextResponse.json({ error: toExclusive.error }, { status: 400 });
  }
  if (
    from.date &&
    toExclusive.date &&
    from.date.getTime() >= toExclusive.date.getTime()
  ) {
    return NextResponse.json(
      { error: "from must be on or before to." },
      { status: 400 },
    );
  }

  if (!forceRefresh && cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    const opportunities = filterByCreatedDate(
      cache.opportunities,
      from.date,
      toExclusive.date,
    );

    return NextResponse.json({
      opportunities,
      total: opportunities.length,
      cached: true,
      cachedAt: new Date(cache.cachedAt).toISOString(),
    });
  }

  try {
    const opportunities = await fetchAllOpportunities();

    const data = opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      monetaryValue: o.monetaryValue,
      status: o.status,
      source: o.source,
      createdAt: o.createdAt,
      attributions: o.attributions,
    }));

    cache = { opportunities: data, total: data.length, cachedAt: Date.now() };

    const filtered = filterByCreatedDate(data, from.date, toExclusive.date);

    return NextResponse.json({
      opportunities: filtered,
      total: filtered.length,
      cached: false,
    });
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
