import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { ghlGet, GhlApiError, GhlConfigError, getGhlConfig } from "@/lib/ghl/client";

export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { locationId } = getGhlConfig();
    const data = await ghlGet(`/locations/${locationId}/customValues`);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof GhlConfigError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    if (e instanceof GhlApiError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status }
      );
    }
    throw e;
  }
}
