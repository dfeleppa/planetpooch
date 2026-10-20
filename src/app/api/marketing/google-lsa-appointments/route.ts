import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getGoogleLsaLeads } from "@/lib/marketing/google-lsa-leads";
import { normalizedPhone } from "@/lib/marketing/moego-client-history";
import { upsertAppointmentPage } from "@/lib/moego/appointment-sync";
import { listBusinesses, streamAppointments } from "@/lib/moego/client";

export const maxDuration = 300;

const BATCH_SIZE = 25;

function day(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

/** Fill historical appointments for exact-phone LSA callers in small, repeatable batches. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const from = day(body.from);
  const to = day(body.to);
  const offset = body.offset;
  if (!from || !to || from > to || !Number.isSafeInteger(offset) || offset < 0) {
    return Response.json({ error: "Valid from, to, and offset are required." }, { status: 400 });
  }

  try {
    const leads = await getGoogleLsaLeads(["pet-resort", "mobile-grooming"], from, to);
    const phones = [...new Set(leads.map((lead) => normalizedPhone(lead.customer)).filter((phone): phone is string => Boolean(phone)))];
    if (!phones.length) return Response.json({ customerCount: 0, fetched: 0, nextOffset: 0, caughtUp: true });

    const customers = await prisma.$queryRaw<{ moegoId: string }[]>`
      SELECT DISTINCT "moegoId" FROM "MoegoCustomer"
      WHERE right(regexp_replace(coalesce("mainPhoneNumber", ''), '[^0-9]', '', 'g'), 10)
        IN (${Prisma.join(phones)})
      ORDER BY "moegoId"
    `;
    const customerIds = customers.slice(offset, offset + BATCH_SIZE).map((row) => row.moegoId);
    if (!customerIds.length) {
      return Response.json({ customerCount: customers.length, fetched: 0, nextOffset: customers.length, caughtUp: true });
    }

    const businesses = await listBusinesses();
    const businessIds = businesses.map((business) => business.id);
    if (!businessIds.length) throw new Error("MoeGo returned no business IDs.");

    let fetched = 0;
    for await (const page of streamAppointments({ customerIds }, businessIds)) {
      await upsertAppointmentPage(page);
      fetched += page.length;
    }
    const nextOffset = offset + customerIds.length;
    return Response.json({
      customerCount: customers.length,
      fetched,
      nextOffset,
      caughtUp: nextOffset >= customers.length,
    });
  } catch (error) {
    console.error("LSA appointment backfill failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "LSA appointment backfill failed." }, { status: 503 });
  }
}
