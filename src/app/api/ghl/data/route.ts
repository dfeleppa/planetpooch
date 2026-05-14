import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import {
  fetchAllOpportunities,
  GhlApiError,
  GhlConfigError,
} from "@/lib/ghl/client";

export const maxDuration = 120;

export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    return NextResponse.json({ opportunities: data, total: data.length });
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
