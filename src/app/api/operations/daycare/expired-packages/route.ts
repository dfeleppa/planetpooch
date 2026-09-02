import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { refreshExpiredDaycarePackageReport } from "@/lib/moego/daycare-package-credit-report";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 300;

export async function POST() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await refreshExpiredDaycarePackageReport();
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    if (error instanceof MoegoConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof MoegoApiError) {
      return NextResponse.json(
        { error: `MoeGo API: ${error.message}` },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("Expired daycare package report refresh failed:", error);
    return NextResponse.json(
      { error: `Expired daycare package report refresh failed: ${message}` },
      { status: 500 }
    );
  }
}
