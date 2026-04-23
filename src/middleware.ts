import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Force users with mustChangePassword=true to set a new password before
    // going anywhere else (except the change-password page itself).
    if (
      token?.mustChangePassword &&
      !pathname.startsWith("/change-password") &&
      !pathname.startsWith("/api/auth")
    ) {
      return NextResponse.redirect(new URL("/change-password", req.url));
    }

    // Redirect non-admins away from admin pages
    if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

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
