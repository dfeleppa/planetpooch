import { syncLeadAppointments } from "@/lib/moego/appointment-sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await syncLeadAppointments());
  } catch (error) {
    console.error("MoeGo appointment sync failed", error);
    return Response.json({ error: "MoeGo appointment sync failed" }, { status: 503 });
  }
}
