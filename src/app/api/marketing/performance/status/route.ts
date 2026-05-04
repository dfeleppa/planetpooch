import { NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import {
  fetchAdAccountInfo,
  MetaApiError,
  MetaConfigError,
} from "@/lib/meta/client";

/**
 * Connection probe. Used by /marketing/performance to render a banner
 * showing whether the Meta integration is wired up and which ad account
 * is connected. Never throws — config / API failures come back as a
 * structured `error` payload so the UI can present the fix.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const account = await fetchAdAccountInfo();
    return NextResponse.json({
      ok: true,
      account: {
        id: account.id,
        name: account.name,
        currency: account.currency,
        timezone: account.timezone_name,
      },
    });
  } catch (err) {
    if (err instanceof MetaConfigError) {
      return NextResponse.json(
        { ok: false, kind: "config", error: err.message },
        { status: 200 }
      );
    }
    if (err instanceof MetaApiError) {
      return NextResponse.json(
        {
          ok: false,
          kind: "api",
          error: err.message,
          status: err.status,
          fbCode: err.fbCode,
        },
        { status: 200 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, kind: "unknown", error: message },
      { status: 200 }
    );
  }
}
