import { NextRequest, NextResponse } from "next/server";
import { LINK_COOKIE } from "@/lib/oauth-identity";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const { invite } = await req.json();
  if (invite && (typeof invite !== "string" || !/^[a-f0-9]{64}$/.test(invite))) {
    return NextResponse.json({ error: "Invalid connection link" }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store");
  const secure = req.nextUrl.protocol === "https:";
  response.cookies.set(LINK_COOKIE, invite || "", {
    httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/", maxAge: invite ? 900 : 0,
  });
  return response;
}
