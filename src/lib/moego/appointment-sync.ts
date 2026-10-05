import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listBusinesses, streamAppointments, type MoegoAppointmentRow } from "./client";

const RESOURCE = "appointment";
const CHUNK_MS = 24 * 60 * 60 * 1000;
const OVERLAP_MS = 30 * 60 * 1000;
const RUNTIME_BUDGET_MS = 180_000;

function date(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function upsertPage(rows: MoegoAppointmentRow[]): Promise<void> {
  if (!rows.length) return;
  const syncedAt = new Date();
  const values = rows.map((row) => Prisma.sql`(
    ${`amoego_${row.id}`}, ${row.id}, ${row.customerId ?? null},
    ${row.orderId ?? null}, ${row.businessId ?? null}, ${row.status ?? null},
    ${row.isDeleted === true}, ${row.noShow === true}, ${date(row.createdTime)},
    ${date(row.duration?.startTime)}, ${date(row.lastUpdatedTime)}, ${syncedAt}
  )`);
  await prisma.$executeRaw`
    INSERT INTO "MoegoAppointment"
      ("id", "moegoId", "customerMoegoId", "orderMoegoId", "businessId",
       "status", "isDeleted", "noShow", "createdTime", "startTime",
       "lastUpdatedTime", "syncedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("moegoId") DO UPDATE SET
      "customerMoegoId" = EXCLUDED."customerMoegoId",
      "orderMoegoId" = EXCLUDED."orderMoegoId",
      "businessId" = EXCLUDED."businessId",
      "status" = EXCLUDED."status",
      "isDeleted" = EXCLUDED."isDeleted",
      "noShow" = EXCLUDED."noShow",
      "createdTime" = EXCLUDED."createdTime",
      "startTime" = EXCLUDED."startTime",
      "lastUpdatedTime" = EXCLUDED."lastUpdatedTime",
      "syncedAt" = EXCLUDED."syncedAt"
  `;
}

async function advanceWatermark(through: Date, count: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "MoegoSyncState" ("resource", "lastSyncedAt", "lastRowCount", "updatedAt")
    VALUES (${RESOURCE}, ${through}, ${count}, NOW())
    ON CONFLICT ("resource") DO UPDATE SET
      "lastSyncedAt" = GREATEST("MoegoSyncState"."lastSyncedAt", EXCLUDED."lastSyncedAt"),
      "lastRowCount" = EXCLUDED."lastRowCount",
      "updatedAt" = NOW()
  `;
}

/** Incrementally import appointment state; the order sync remains the payment source. */
export async function syncLeadAppointments(): Promise<{
  fetched: number;
  chunks: number;
  caughtUp: boolean;
  completedThrough: string | null;
}> {
  const startedAt = Date.now();
  const target = new Date();
  const firstSubmission = await prisma.websiteFormSubmission.findFirst({
    where: { status: "SYNCED", moegoCustomerId: { not: null } },
    orderBy: { receivedAt: "asc" },
    select: { receivedAt: true },
  });
  if (!firstSubmission) {
    return { fetched: 0, chunks: 0, caughtUp: true, completedThrough: null };
  }

  const businesses = await listBusinesses();
  const businessIds = businesses.map((business) => business.id);
  if (!businessIds.length) throw new Error("MoeGo returned no business IDs for appointment sync");

  const initial = new Date(firstSubmission.receivedAt.getTime() - 24 * 60 * 60 * 1000);
  let cursor = (await prisma.moegoSyncState.findUnique({
    where: { resource: RESOURCE }, select: { lastSyncedAt: true },
  }))?.lastSyncedAt ?? initial;
  let fetched = 0;
  let chunks = 0;

  while (cursor < target && Date.now() - startedAt < RUNTIME_BUDGET_MS) {
    const end = new Date(Math.min(cursor.getTime() + CHUNK_MS, target.getTime()));
    const start = new Date(Math.max(initial.getTime(), cursor.getTime() - OVERLAP_MS));
    let chunkCount = 0;
    for await (const page of streamAppointments({
      lastUpdatedTime: { startTime: start.toISOString(), endTime: end.toISOString() },
    }, businessIds)) {
      await upsertPage(page);
      chunkCount += page.length;
    }
    await advanceWatermark(end, chunkCount);
    console.info("MoeGo appointment sync chunk complete", {
      completedThrough: end.toISOString(),
      fetched: chunkCount,
    });
    cursor = end;
    fetched += chunkCount;
    chunks++;
  }

  return { fetched, chunks, caughtUp: cursor >= target, completedThrough: cursor.toISOString() };
}
