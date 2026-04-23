import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map((c) => c.name);

  return Response.json({
    session,
    cookieNames: allCookies,
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    nextAuthUrl: process.env.NEXTAUTH_URL,
  });
}
