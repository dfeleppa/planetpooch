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
  const jobTitle = (token.jobTitle as string | null | undefined) ?? null;
  const isManagerOrAbove =
    role === "MANAGER" ||
    role === "SUPER_ADMIN" ||
    role === "ADMIN";
  // "Front Desk Staff" job title sits above floor staff and in-house
  // grooming, gaining admin-section + module-edit access regardless of role.
  const isFrontDesk = jobTitle === "Front Desk Staff";
  // CMO job title gets full marketing and module-management access regardless of role.
  const hasMarketingAccess =
    role === "MARKETING" ||
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    jobTitle === "CMO";
  const canManageModules =
    role === "SUPER_ADMIN" || role === "ADMIN" || jobTitle === "CMO";
  const canEditModules = canManageModules || isFrontDesk;
  const canAccessAdmin = isManagerOrAbove || isFrontDesk;

  // Module management section: top-tier (and CMO) can do anything; Front
  // Desk can edit but the API enforces no-delete.
  if (pathname.startsWith("/admin/modules") && !canEditModules) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Admin section: MANAGER+, plus Front Desk Staff (employee edit, no delete).
  if (pathname.startsWith("/admin") && !canAccessAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Marketing section requires MARKETING or SUPER_ADMIN
  if (pathname.startsWith("/marketing") && !hasMarketingAccess) {
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
    "/marketing/:path*",
    "/change-password",
  ],
};
