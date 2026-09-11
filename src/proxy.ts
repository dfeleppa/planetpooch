import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { businessCookieName, businessFor, resolveBusiness } from "@/lib/business";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/finance") {
    const target = req.nextUrl.clone();
    target.pathname = "/finance/profit-loss";
    return NextResponse.redirect(target);
  }

  if (
    pathname === "/finance/ad-reporting" ||
    pathname.startsWith("/finance/ad-reporting/")
  ) {
    const target = req.nextUrl.clone();
    target.pathname = pathname.replace(
      "/finance/ad-reporting",
      "/marketing/ad-reporting"
    );
    return NextResponse.redirect(target);
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: !!process.env.VERCEL,
  });

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
  // CMO job title gets full marketing and module-management access regardless of role.
  const hasMarketingAccess =
    role === "MARKETING" ||
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    jobTitle === "CMO";
  const canManageModules =
    role === "SUPER_ADMIN" || role === "ADMIN" || jobTitle === "CMO";
  const canEditModules = canManageModules;
  const canAccessAdmin = isManagerOrAbove;
  const canAccessFinance = role === "SUPER_ADMIN" || role === "ADMIN";

  // The business overview contains finance data; managers and CMO titles
  // alone do not grant access, including through a direct URL.
  if (
    (pathname === "/admin/dashboard" || pathname.startsWith("/admin/dashboard/")) &&
    !canAccessFinance
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Module management section: top-tier admins and CMO can edit.
  if (pathname.startsWith("/admin/modules") && !canEditModules) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Admin section: MANAGER+.
  if (pathname.startsWith("/admin") && !canAccessAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Marketing section requires MARKETING or SUPER_ADMIN
  if (pathname.startsWith("/marketing") && !hasMarketingAccess) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Finance section: top-tier admins only.
  if (pathname.startsWith("/finance") && !canAccessFinance) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-portal-url", req.nextUrl.toString());
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const preferenceName = businessCookieName(token.id as string);
  if (!req.cookies.has(preferenceName)) {
    const legacy = businessFor(req.nextUrl.searchParams.get("company"))
      ?? businessFor(req.nextUrl.searchParams.get("business"))
      ?? businessFor(req.nextUrl.searchParams.get("segment"))
      ?? (pathname.startsWith("/finance/payroll/mobile-grooming") ? businessFor("GROOMING") : undefined);
    const business = resolveBusiness({ id: token.id as string, role, company: token.company, jobTitle }, legacy?.company);
    response.cookies.set(preferenceName, business.company, {
      httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/career/:path*",
    "/modules/:path*",
    "/admin/:path*",
    "/search/:path*",
    "/maintenance/:path*",
    "/operations/:path*",
    "/marketing/:path*",
    "/finance/:path*",
    "/change-password",
  ],
};
