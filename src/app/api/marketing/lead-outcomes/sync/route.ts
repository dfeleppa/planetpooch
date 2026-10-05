import { getSession } from "@/lib/auth-helpers";
import { syncLeadAppointments } from "@/lib/moego/appointment-sync";

export const maxDuration = 300;

export async function POST() {
  const session = await getSession();
  if (!session?.user || !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return Response.json(await syncLeadAppointments());
  } catch (error) {
    console.error("MoeGo appointment sync failed", error);
    return Response.json({ error: "MoeGo appointment sync failed" }, { status: 503 });
  }
}
