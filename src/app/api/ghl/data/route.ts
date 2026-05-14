import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import {
  fetchAllOpportunities,
  GhlApiError,
  GhlConfigError,
  GhlOpportunity,
} from "@/lib/ghl/client";

export const maxDuration = 120;

type CachedData = {
  opportunities: Pick<
    GhlOpportunity,
    "id" | "name" | "monetaryValue" | "status" | "source" | "createdAt" | "attributions"
  >[];
  total: number;
  cachedAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache: CachedData | null = null;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!forceRefresh && cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      opportunities: cache.opportunities,
      total: cache.total,
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

    return NextResponse.json({
      opportunities: data,
      total: data.length,
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
