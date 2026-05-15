import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import {
  listCompanies,
  MoegoApiError,
  MoegoConfigError,
} from "@/lib/moego/client";

/**
 * Bootstrap helper: lists every MoeGo company the API key has access to.
 * Run this once to find the obfuscated company ID (cmp_...) to paste into
 * the MOEGO_COMPANY_ID env var.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const companies = await listCompanies();
    return NextResponse.json({ companies });
  } catch (err) {
    if (err instanceof MoegoConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof MoegoApiError) {
      return NextResponse.json(
        { error: `MoeGo API: ${err.message}` },
        { status: err.status }
      );
    }
    throw err;
  }
}
