import { NextRequest, NextResponse } from "next/server";
import { syncAll } from "@/lib/moego/sync";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 300;

/**
 * Vercel Cron entrypoint (see vercel.json). Vercel signs each invocation
 * with `Authorization: Bearer ${CRON_SECRET}` so this public GET can't be
 * triggered anonymously.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
