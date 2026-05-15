import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { syncAll } from "@/lib/moego/sync";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 300;

/** Manual sync trigger from the /finance/moego UI. SUPER_ADMIN only. */
export async function POST() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncAll();
    return NextResponse.json(result);
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
