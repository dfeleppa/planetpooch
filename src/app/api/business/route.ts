import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { availableBusinesses, businessCookieName, businessSwitchPath, isBusinessSwitchOriginAllowed } from "@/lib/business";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isBusinessSwitchOriginAllowed(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const business = availableBusinesses(session.user).find((option) => option.company === body?.company);
  if (!business || typeof body?.href !== "string") {
    return NextResponse.json({ error: "Business is not available" }, { status: 400 });
  }
  const response = NextResponse.json({ href: businessSwitchPath(body.href, business.company) });
  response.cookies.set(businessCookieName(session.user.id), business.company, {
    httpOnly: true, sameSite: "lax", secure: request.headers.get("origin")!.startsWith("https:"), path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
