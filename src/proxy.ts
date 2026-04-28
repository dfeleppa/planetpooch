import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: !!process.env.VERCEL,
  });

  const { pathname } = req.nextUrl;

  // Not authenticated — redirect to login
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Force password change before accessing anything else
  if (
    token.mustChangePassword &&
    !pathname.startsWith("/change-password") &&
    !pathname.startsWith("/api/auth")
  ) {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  const role = token.role as string;
  const isManagerOrAbove =
    role === "MANAGER" ||
    role === "SUPER_ADMIN" ||
    role === "DOS" ||
    role === "ADMIN";
  const isTopTier = role === "SUPER_ADMIN" || role === "DOS" || role === "ADMIN";

  // Only top-tier roles can manage modules/lessons
  if (pathname.startsWith("/admin/modules") && !isTopTier) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Admin section requires MANAGER or SUPER_ADMIN
  if (pathname.startsWith("/admin") && !isManagerOrAbove) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/modules/:path*",
    "/admin/:path*",
    "/search/:path*",
    "/maintenance/:path*",
    "/tasks/:path*",
    "/change-password",
  ],
};
