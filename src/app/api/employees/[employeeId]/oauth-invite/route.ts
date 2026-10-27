import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { hashLink } from "@/lib/oauth-identity";
import { isSameOriginRequest } from "@/lib/request-origin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const session = await getSession();
  if (session?.user?.role !== "SUPER_ADMIN") return new NextResponse(null, { status: 403 });
  if (!isSameOriginRequest(req.headers.get("origin"), req.headers.get("host"))) return new NextResponse(null, { status: 403 });
  const { employeeId } = await params;
  const invite = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const result = await prisma.user.updateMany({
    where: { id: employeeId, terminatedAt: null },
    data: { oauthInviteHash: hashLink(invite), oauthInviteExpiresAt: expiresAt },
  });
  if (!result.count) return NextResponse.json({ error: "Active employee not found" }, { status: 404 });
  const url = new URL("/login", req.headers.get("origin")!);
  // Fragment avoids including the bearer token in HTTP access logs/referrers.
  url.hash = `invite=${invite}`;
  return NextResponse.json({ url: url.toString(), expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
