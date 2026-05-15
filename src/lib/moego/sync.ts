import { prisma } from "@/lib/prisma";
import {
  listBusinesses,
  listCustomers,
  listLeads,
  listOrders,
  toCents,
  type MoegoCustomerRow,
  type MoegoLeadRow,
  type MoegoOrderRow,
} from "./client";

export type ResourceResult = {
  fetched: number;
  upserted: number;
};

export type SyncResult = {
  windowStart: string;
  windowEnd: string;
  customers: ResourceResult;
  orders: ResourceResult;
  leads: ResourceResult;
  leadSourceMatched: number;
  /// How many time-window slices we processed in this invocation. >1 means
  /// the backfill is still catching up; the next call resumes from where
  /// the watermarks landed.
  chunks: number;
  /// True when every per-resource watermark is at or past `now` — the
  /// backfill is fully drained and the next call will be a no-op fast path.
  caughtUp: boolean;
};

/**
 * Overlap window: every incremental sync re-pulls this many minutes before
 * the last watermark to absorb late updates and clock skew between us and
 * MoeGo. Cheap insurance against drift.
 */
const OVERLAP_MINUTES = 30;

/**
 * Initial backfill window when MoegoSyncState has no row for a resource.
 * 2 years covers a reasonable customer history for LTV without trying to
 * page through the entire dataset on first run.
 */
const BACKFILL_DAYS = 730;

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * The raw watermark — the upper bound of what we've already synced for
 * this resource. Used to decide whether we're caught up.
 */
async function getCompletedThrough(resource: string): Promise<Date> {
  const row = await prisma.moegoSyncState.findUnique({ where: { resource } });
  if (row) return row.lastSyncedAt;
  return new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The slice's startTime for an API call — completedThrough minus a small
 * overlap to absorb late updates and clock skew. We accept a few seconds
 * of re-pulled rows per chunk in exchange for not missing edits.
 */
function sliceStartFrom(completedThrough: Date): Date {
  return new Date(completedThrough.getTime() - OVERLAP_MINUTES * 60_000);
}

async function setWatermark(
  resource: string,
  syncedAt: Date,
  rowCount: number
): Promise<void> {
  await prisma.moegoSyncState.upsert({
    where: { resource },
    create: { resource, lastSyncedAt: syncedAt, lastRowCount: rowCount },
    update: { lastSyncedAt: syncedAt, lastRowCount: rowCount },
  });
}

/**
 * MoeGo customers carry an optional `field_lead_source_detail` custom
 * field. Pull it out as the customer's lead source if present — otherwise
 * we'll fall back to phone-matched leads after all three resources sync.
 */
function customerLeadSource(row: MoegoCustomerRow): string | null {
  const cf = row.customFields;
  if (!cf || typeof cf !== "object") return null;
  const v = (cf as Record<string, unknown>)["field_lead_source_detail"];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

async function syncCustomers(start: Date, end: Date): Promise<ResourceResult> {
  const rows = await listCustomers({
    lastUpdatedTime: {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  });

  let upserted = 0;
  for (const r of rows) {
    await prisma.moegoCustomer.upsert({
      where: { moegoId: r.id },
      create: {
        moegoId: r.id,
        name: r.name ?? null,
        email: r.email ?? null,
        mainPhoneNumber: r.mainPhoneNumber ?? null,
        leadSource: customerLeadSource(r),
        createdTime: new Date(r.createdTime),
        lastUpdatedTime: r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null,
        syncedAt: new Date(),
      },
      update: {
        name: r.name ?? null,
        email: r.email ?? null,
        mainPhoneNumber: r.mainPhoneNumber ?? null,
        // Don't clobber an existing leadSource with null — once attributed
        // we want it to stick across re-syncs.
        ...(customerLeadSource(r) ? { leadSource: customerLeadSource(r) } : {}),
        lastUpdatedTime: r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null,
        syncedAt: new Date(),
      },
    });
    upserted++;
  }
  return { fetched: rows.length, upserted };
}

async function syncOrders(
  start: Date,
  end: Date,
  businessIds: string[]
): Promise<ResourceResult> {
  const rows: MoegoOrderRow[] = await listOrders(
    {
      lastUpdatedTime: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    },
    businessIds
  );

  let upserted = 0;
  for (const r of rows) {
    await prisma.moegoOrder.upsert({
      where: { moegoId: r.id },
      create: {
        moegoId: r.id,
        customerMoegoId: r.customerId ?? null,
        status: r.status ?? null,
        subTotalCents: toCents(r.subTotalAmount),
        totalCents: toCents(r.totalAmount),
        paidCents: toCents(r.paidAmount),
        refundedCents: toCents(r.refundedAmount),
        createdTime: new Date(r.createdTime),
        lastUpdatedTime: r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null,
        syncedAt: new Date(),
      },
      update: {
        customerMoegoId: r.customerId ?? null,
        status: r.status ?? null,
        subTotalCents: toCents(r.subTotalAmount),
        totalCents: toCents(r.totalAmount),
        paidCents: toCents(r.paidAmount),
        refundedCents: toCents(r.refundedAmount),
        lastUpdatedTime: r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null,
        syncedAt: new Date(),
      },
    });
    upserted++;
  }
  return { fetched: rows.length, upserted };
}

async function syncLeads(
  start: Date,
  end: Date,
  businessIds: string[]
): Promise<ResourceResult> {
  const rows: MoegoLeadRow[] = await listLeads(
    {
      lastUpdatedTime: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    },
    businessIds
  );

  let upserted = 0;
  for (const r of rows) {
    await prisma.moegoLead.upsert({
      where: { moegoId: r.id },
      create: {
        moegoId: r.id,
        name: r.name ?? null,
        mainPhoneNumber: r.mainPhoneNumber ?? null,
        referralSource: r.referralSource ?? null,
        lifeCycleId: r.lifeCycleId ?? null,
        actionStatusId: r.actionStatusId ?? null,
        createdTime: new Date(r.createdTime),
        lastUpdatedTime: r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null,
        syncedAt: new Date(),
      },
      update: {
        name: r.name ?? null,
        mainPhoneNumber: r.mainPhoneNumber ?? null,
        referralSource: r.referralSource ?? null,
        lifeCycleId: r.lifeCycleId ?? null,
        actionStatusId: r.actionStatusId ?? null,
        lastUpdatedTime: r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null,
        syncedAt: new Date(),
      },
    });
    upserted++;
  }
  return { fetched: rows.length, upserted };
}

/**
 * For customers that still have no leadSource, try to attribute one from
 * a Lead that shares their phone number. MoeGo doesn't preserve the
 * lead→customer linkage on promote, so phone is the only reliable join.
 * Returns the number of customers we successfully attributed.
 */
async function attributeLeadSources(): Promise<number> {
  const customers = await prisma.moegoCustomer.findMany({
    where: { leadSource: null, mainPhoneNumber: { not: null } },
    select: { id: true, mainPhoneNumber: true },
  });
  if (customers.length === 0) return 0;

  const phones = Array.from(
    new Set(customers.map((c) => c.mainPhoneNumber!).filter(Boolean))
  );
  const leads = await prisma.moegoLead.findMany({
    where: {
      mainPhoneNumber: { in: phones },
      referralSource: { not: null },
    },
    select: { mainPhoneNumber: true, referralSource: true },
  });

  const byPhone = new Map<string, string>();
  for (const l of leads) {
    if (l.mainPhoneNumber && l.referralSource && !byPhone.has(l.mainPhoneNumber)) {
      byPhone.set(l.mainPhoneNumber, l.referralSource);
    }
  }

  let matched = 0;
  for (const c of customers) {
    const src = c.mainPhoneNumber ? byPhone.get(c.mainPhoneNumber) : undefined;
    if (!src) continue;
    await prisma.moegoCustomer.update({
      where: { id: c.id },
      data: { leadSource: src },
    });
    matched++;
  }
  return matched;
}

/**
 * Each invocation processes at most CHUNK_DAYS of history per resource per
 * loop iteration. A 2-year backfill would otherwise blow past Vercel's
 * function timeout; this way the work splits into bite-sized slices and
 * the per-resource watermark advances after every successful slice — a
 * 504 mid-run loses at most one chunk's progress.
 */
const CHUNK_DAYS = 30;

/**
 * Soft runtime budget per invocation. Vercel's maxDuration is 300s; we
 * exit a bit early so the in-flight slice can finish cleanly and the
 * response can serialize. Re-call the endpoint to keep draining.
 */
const RUNTIME_BUDGET_MS = 250_000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Run an incremental sync of all three MoeGo resources. Each resource has
 * its own watermark so a partial failure (e.g. orders 500s) doesn't
 * advance the other resources' cursors.
 *
 * The function loops: pick the resource with the oldest watermark, sync
 * a CHUNK_DAYS-wide slice, advance that resource's watermark, repeat.
 * Stops when either (a) everything is caught up to `now` or (b) we've
 * burned the runtime budget. Returns `caughtUp: false` in case (b) so
 * the caller knows to call again.
 */
export async function syncAll(): Promise<SyncResult> {
  const startedAt = Date.now();
  const targetEnd = new Date();

  // /v1/orders:list and /v1/leads:list require a non-empty businessIds
  // array. Discover once per invocation rather than caching: it's a
  // single small page and ensures new businesses get picked up
  // automatically without an env var.
  const businesses = await listBusinesses();
  const businessIds = businesses.map((b) => b.id);
  if (businessIds.length === 0) {
    throw new Error(
      "MoeGo returned no businesses under the configured company. Verify MOEGO_COMPANY_ID."
    );
  }

  const totals = {
    customers: { fetched: 0, upserted: 0 } as ResourceResult,
    orders: { fetched: 0, upserted: 0 } as ResourceResult,
    leads: { fetched: 0, upserted: 0 } as ResourceResult,
  };
  const initialCompleted = {
    customer: await getCompletedThrough("customer"),
    order: await getCompletedThrough("order"),
    lead: await getCompletedThrough("lead"),
  };
  let chunks = 0;

  while (true) {
    if (Date.now() - startedAt > RUNTIME_BUDGET_MS) break;

    const completed = {
      customer: await getCompletedThrough("customer"),
      order: await getCompletedThrough("order"),
      lead: await getCompletedThrough("lead"),
    };

    // Pick the resource furthest behind. Tie-break order is arbitrary.
    const behind = (Object.entries(completed) as [
      "customer" | "order" | "lead",
      Date,
    ][])
      .filter(([, w]) => w < targetEnd)
      .sort((a, b) => a[1].getTime() - b[1].getTime());

    if (behind.length === 0) break; // caught up

    const [resource, completedThrough] = behind[0];
    const sliceStart = sliceStartFrom(completedThrough);
    const sliceEnd = new Date(
      Math.min(
        addDays(completedThrough, CHUNK_DAYS).getTime(),
        targetEnd.getTime()
      )
    );

    if (resource === "customer") {
      const r = await syncCustomers(sliceStart, sliceEnd);
      totals.customers.fetched += r.fetched;
      totals.customers.upserted += r.upserted;
      await setWatermark("customer", sliceEnd, r.fetched);
    } else if (resource === "order") {
      const r = await syncOrders(sliceStart, sliceEnd, businessIds);
      totals.orders.fetched += r.fetched;
      totals.orders.upserted += r.upserted;
      await setWatermark("order", sliceEnd, r.fetched);
    } else {
      const r = await syncLeads(sliceStart, sliceEnd, businessIds);
      totals.leads.fetched += r.fetched;
      totals.leads.upserted += r.upserted;
      await setWatermark("lead", sliceEnd, r.fetched);
    }
    chunks++;
  }

  const finalCompleted = {
    customer: await getCompletedThrough("customer"),
    order: await getCompletedThrough("order"),
    lead: await getCompletedThrough("lead"),
  };
  const caughtUp =
    finalCompleted.customer >= targetEnd &&
    finalCompleted.order >= targetEnd &&
    finalCompleted.lead >= targetEnd;

  // Lead-source attribution is cheap (single grouped join) so we run it
  // every invocation rather than gating on caughtUp — partial progress is
  // still useful while later chunks are draining.
  const leadSourceMatched = await attributeLeadSources();

  return {
    windowStart: initialCompleted.customer.toISOString(),
    windowEnd: isoNow(),
    customers: totals.customers,
    orders: totals.orders,
    leads: totals.leads,
    leadSourceMatched,
    chunks,
    caughtUp,
  };
}
