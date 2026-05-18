import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  listBusinesses,
  readReferralSource,
  readTags,
  streamCustomers,
  streamLeads,
  streamOrders,
  MoegoApiError,
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
  /// Resources whose endpoints returned 401/403. We mark them caught-up
  /// so the loop doesn't spin on them, but surface the list so the user
  /// knows scope is missing (e.g. leads is a paid add-on that not every
  /// MoeGo account has).
  skipped: string[];
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
 * this resource. Used to decide whether we're caught up. Callers pass
 * the default to use when no row exists (typically `now - BACKFILL_DAYS`
 * for the normal incremental sync, or the window start for a year sync).
 */
async function getCompletedThrough(
  resource: string,
  initialDefault: Date
): Promise<Date> {
  const row = await prisma.moegoSyncState.findUnique({ where: { resource } });
  if (row) return row.lastSyncedAt;
  return initialDefault;
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
 * Try multiple MoeGo signals to determine a customer's lead source.
 * Priority is roughly "most authoritative first":
 *   1. customer.referralSource — the typed field MoeGo intends for this
 *   2. customer.source — plain string "acquisition channel"
 *   3. customFields.field_lead_source_detail — a common custom-field
 *      name some accounts use for in-house tracking
 * Anything still null at this point will be backfilled later by phone-
 * matched MoegoLead.referralSource in attributeLeadSources().
 */
function customerLeadSource(row: MoegoCustomerRow): string | null {
  const ref = readReferralSource(row.referralSource);
  if (ref) return ref;
  if (row.source && row.source.trim()) return row.source.trim();
  const cf = row.customFields;
  if (cf && typeof cf === "object") {
    const v = (cf as Record<string, unknown>)["field_lead_source_detail"];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Bulk upsert one page of customers in a single Postgres round trip.
 * Postgres' `INSERT ... ON CONFLICT DO UPDATE` handles per-row upsert
 * semantics atomically, ~50–100× faster than the Prisma per-row upsert
 * loop it replaces.
 *
 * `leadSource` uses `COALESCE(EXCLUDED.leadSource, "MoegoCustomer".leadSource)`
 * so a re-sync without a new value doesn't blank an existing attribution.
 */
/**
 * MoeGo splits name into firstName/lastName with no composite. Build
 * the display name from whichever pieces are present so the table and
 * detail view stop showing "—" for every customer.
 */
function customerDisplayName(r: MoegoCustomerRow): string | null {
  if (r.name && r.name.trim()) return r.name.trim();
  const parts = [r.firstName, r.lastName].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  if (parts.length === 0) return null;
  return parts.join(" ").trim();
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function upsertCustomerPage(rows: MoegoCustomerRow[]): Promise<number> {
  const valid = rows.filter((r) => parseDate(r.createdTime) !== null);
  if (valid.length === 0) return 0;
  const now = new Date();
  const values = valid.map(
    (r) =>
      Prisma.sql`(${"cmoego_" + r.id}, ${r.id}, ${customerDisplayName(r)}, ${
        r.email ?? null
      }, ${r.mainPhoneNumber ?? r.phone ?? null}, ${customerLeadSource(r)}, ${
        r.preferredBusinessId ?? null
      }, ${parseDate(r.lastAppointmentDate)}, ${parseDate(
        r.nextAppointmentDate
      )}, ${readTags(r.tags)}, ${parseDate(r.createdTime)!}, ${
        r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null
      }, ${now})`
  );
  await prisma.$executeRaw`
    INSERT INTO "MoegoCustomer"
      ("id", "moegoId", "name", "email", "mainPhoneNumber", "leadSource",
       "preferredBusinessId", "lastAppointmentDate", "nextAppointmentDate",
       "tags", "createdTime", "lastUpdatedTime", "syncedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("moegoId") DO UPDATE SET
      "name"                = EXCLUDED."name",
      "email"               = EXCLUDED."email",
      "mainPhoneNumber"     = EXCLUDED."mainPhoneNumber",
      "leadSource"          = COALESCE(EXCLUDED."leadSource", "MoegoCustomer"."leadSource"),
      "preferredBusinessId" = EXCLUDED."preferredBusinessId",
      "lastAppointmentDate" = EXCLUDED."lastAppointmentDate",
      "nextAppointmentDate" = EXCLUDED."nextAppointmentDate",
      "tags"                = EXCLUDED."tags",
      "lastUpdatedTime"     = EXCLUDED."lastUpdatedTime",
      "syncedAt"            = EXCLUDED."syncedAt"
  `;
  return valid.length;
}

async function syncCustomers(
  start: Date,
  end: Date,
  shouldStop: () => boolean
): Promise<{ fetched: number; upserted: number; completed: boolean }> {
  let fetched = 0;
  let upserted = 0;
  let completed = true;
  for await (const page of streamCustomers({
    lastUpdatedTime: {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  })) {
    fetched += page.length;
    upserted += await upsertCustomerPage(page);
    if (shouldStop()) {
      completed = false;
      break;
    }
  }
  return { fetched, upserted, completed };
}

async function upsertOrderPage(rows: MoegoOrderRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date();
  const values = rows.map(
    (r) =>
      Prisma.sql`(${"omoego_" + r.id}, ${r.id}, ${r.customerId ?? null}, ${
        r.businessId ?? null
      }, ${r.status ?? null}, ${toCents(r.subTotalAmount)}, ${toCents(
        r.totalAmount
      )}, ${toCents(r.paidAmount)}, ${toCents(r.refundedAmount)}, ${toCents(
        r.taxAmount
      )}, ${toCents(r.discountAmount)}, ${toCents(r.tipsAmount)}, ${new Date(
        r.createdTime
      )}, ${parseDate(r.salesDatetime)}, ${parseDate(r.completedTime)}, ${
        r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null
      }, ${now})`
  );
  await prisma.$executeRaw`
    INSERT INTO "MoegoOrder"
      ("id", "moegoId", "customerMoegoId", "businessId", "status",
       "subTotalCents", "totalCents", "paidCents", "refundedCents",
       "taxCents", "discountCents", "tipsCents",
       "createdTime", "salesDatetime", "completedTime",
       "lastUpdatedTime", "syncedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("moegoId") DO UPDATE SET
      "customerMoegoId" = EXCLUDED."customerMoegoId",
      "businessId"      = EXCLUDED."businessId",
      "status"          = EXCLUDED."status",
      "subTotalCents"   = EXCLUDED."subTotalCents",
      "totalCents"      = EXCLUDED."totalCents",
      "paidCents"       = EXCLUDED."paidCents",
      "refundedCents"   = EXCLUDED."refundedCents",
      "taxCents"        = EXCLUDED."taxCents",
      "discountCents"   = EXCLUDED."discountCents",
      "tipsCents"       = EXCLUDED."tipsCents",
      "salesDatetime"   = EXCLUDED."salesDatetime",
      "completedTime"   = EXCLUDED."completedTime",
      "lastUpdatedTime" = EXCLUDED."lastUpdatedTime",
      "syncedAt"        = EXCLUDED."syncedAt"
  `;
  return rows.length;
}

async function syncOrders(
  start: Date,
  end: Date,
  businessIds: string[],
  shouldStop: () => boolean
): Promise<{ fetched: number; upserted: number; completed: boolean }> {
  let fetched = 0;
  let upserted = 0;
  let completed = true;
  for await (const page of streamOrders(
    {
      lastUpdatedTime: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    },
    businessIds
  )) {
    fetched += page.length;
    upserted += await upsertOrderPage(page);
    if (shouldStop()) {
      completed = false;
      break;
    }
  }
  return { fetched, upserted, completed };
}

async function upsertLeadPage(rows: MoegoLeadRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date();
  const values = rows.map(
    (r) =>
      Prisma.sql`(${"lmoego_" + r.id}, ${r.id}, ${r.name ?? null}, ${
        r.mainPhoneNumber ?? null
      }, ${readReferralSource(r.referralSource)}, ${r.lifeCycleId ?? null}, ${
        r.actionStatusId ?? null
      }, ${new Date(r.createdTime)}, ${
        r.lastUpdatedTime ? new Date(r.lastUpdatedTime) : null
      }, ${now})`
  );
  await prisma.$executeRaw`
    INSERT INTO "MoegoLead"
      ("id", "moegoId", "name", "mainPhoneNumber", "referralSource",
       "lifeCycleId", "actionStatusId", "createdTime", "lastUpdatedTime",
       "syncedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("moegoId") DO UPDATE SET
      "name"            = EXCLUDED."name",
      "mainPhoneNumber" = EXCLUDED."mainPhoneNumber",
      "referralSource"  = EXCLUDED."referralSource",
      "lifeCycleId"     = EXCLUDED."lifeCycleId",
      "actionStatusId"  = EXCLUDED."actionStatusId",
      "lastUpdatedTime" = EXCLUDED."lastUpdatedTime",
      "syncedAt"        = EXCLUDED."syncedAt"
  `;
  return rows.length;
}

async function syncLeads(
  start: Date,
  end: Date,
  businessIds: string[],
  shouldStop: () => boolean
): Promise<{ fetched: number; upserted: number; completed: boolean }> {
  let fetched = 0;
  let upserted = 0;
  let completed = true;
  for await (const page of streamLeads(
    {
      lastUpdatedTime: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    },
    businessIds
  )) {
    fetched += page.length;
    upserted += await upsertLeadPage(page);
    if (shouldStop()) {
      completed = false;
      break;
    }
  }
  return { fetched, upserted, completed };
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
export type SyncWindow = {
  /** Inclusive lower bound on lastUpdatedTime. */
  start: Date;
  /** Exclusive upper bound. The sync stops once watermarks cross this. */
  end: Date;
  /**
   * Suffix appended to each MoegoSyncState resource key (e.g. ":y2024")
   * so a windowed sync's progress is tracked independently of the
   * regular incremental sync. Keep short; persisted to a TEXT pkey.
   */
  tag: string;
};

export type SyncOptions = {
  /**
   * When set, sync only rows in [window.start, window.end) and track
   * progress under windowed resource keys ("customer:<tag>", etc.) so
   * the regular incremental sync's watermarks aren't disturbed.
   */
  window?: SyncWindow;
};

export async function syncAll(options: SyncOptions = {}): Promise<SyncResult> {
  const { window } = options;
  const startedAt = Date.now();
  const targetEnd = window?.end ?? new Date();
  /// Default for a brand-new MoegoSyncState row. For windowed syncs we
  /// start at window.start; for the normal sync we go back BACKFILL_DAYS.
  const initialDefault =
    window?.start ?? new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  /// Resource keys are suffixed for windowed syncs so we keep a
  /// separate cursor per window.
  const rkey = (base: "customer" | "order" | "lead") =>
    window ? `${base}:${window.tag}` : base;

  // /v1/orders:list and /v1/leads:list require a non-empty businessIds
  // array. Discover once per invocation rather than caching: it's a
  // single small page and ensures new businesses get picked up
  // automatically without an env var.
  //
  // If the API key isn't scoped to /v1/businesses:list, fall back to
  // syncing customers only — orders and leads will be marked skipped
  // below since they can't run without businessIds.
  let businessIds: string[] = [];
  let businessesAccessDenied = false;
  try {
    const businesses = await listBusinesses();
    businessIds = businesses.map((b) => b.id);
  } catch (err) {
    if (
      err instanceof MoegoApiError &&
      (err.status === 401 || err.status === 403)
    ) {
      businessesAccessDenied = true;
    } else {
      throw err;
    }
  }
  // No businesses (either denied or empty list) → treat order/lead as
  // out-of-scope. Surfaced in `skipped` below so the user can tell
  // whether to ask MoeGo for broader access or to verify their
  // MOEGO_COMPANY_ID.
  const noBusinessIds = businessIds.length === 0;

  const totals = {
    customers: { fetched: 0, upserted: 0 } as ResourceResult,
    orders: { fetched: 0, upserted: 0 } as ResourceResult,
    leads: { fetched: 0, upserted: 0 } as ResourceResult,
  };
  const initialCompleted = {
    customer: await getCompletedThrough(rkey("customer"), initialDefault),
    order: await getCompletedThrough(rkey("order"), initialDefault),
    lead: await getCompletedThrough(rkey("lead"), initialDefault),
  };
  let chunks = 0;
  const skipped: string[] = [];

  // No business IDs → can't query orders or leads. Mark both done so the
  // loop only attempts customers. Surfaced in the response so the user
  // knows scope is missing.
  if (noBusinessIds) {
    skipped.push(
      businessesAccessDenied ? "businesses(403)" : "businesses(empty)",
      "order",
      "lead"
    );
    await setWatermark(rkey("order"), targetEnd, 0);
    await setWatermark(rkey("lead"), targetEnd, 0);
  }

  /**
   * Some MoeGo API keys aren't scoped to every resource — leads in
   * particular is a paid add-on that not every account has. Rather than
   * fail the whole sync on a 401/403, mark the resource as caught-up so
   * the loop doesn't keep retrying it, and continue with the rest.
   */
  async function handlePermissionDenied(
    resource: "customer" | "order" | "lead",
    err: unknown
  ): Promise<boolean> {
    if (err instanceof MoegoApiError && (err.status === 401 || err.status === 403)) {
      if (!skipped.includes(resource)) skipped.push(resource);
      await setWatermark(rkey(resource), targetEnd, 0);
      return true;
    }
    return false;
  }

  while (true) {
    if (Date.now() - startedAt > RUNTIME_BUDGET_MS) break;

    const completed = {
      customer: await getCompletedThrough(rkey("customer"), initialDefault),
      order: await getCompletedThrough(rkey("order"), initialDefault),
      lead: await getCompletedThrough(rkey("lead"), initialDefault),
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

    const shouldStop = () => Date.now() - startedAt > RUNTIME_BUDGET_MS;

    try {
      if (resource === "customer") {
        const r = await syncCustomers(sliceStart, sliceEnd, shouldStop);
        totals.customers.fetched += r.fetched;
        totals.customers.upserted += r.upserted;
        // Only advance the watermark if the slice finished cleanly.
        // Otherwise the next invocation re-processes this slice from
        // its start (upserts are idempotent — re-pull is safe).
        if (r.completed) await setWatermark(rkey("customer"), sliceEnd, r.fetched);
      } else if (resource === "order") {
        const r = await syncOrders(
          sliceStart,
          sliceEnd,
          businessIds,
          shouldStop
        );
        totals.orders.fetched += r.fetched;
        totals.orders.upserted += r.upserted;
        if (r.completed) await setWatermark(rkey("order"), sliceEnd, r.fetched);
      } else {
        const r = await syncLeads(
          sliceStart,
          sliceEnd,
          businessIds,
          shouldStop
        );
        totals.leads.fetched += r.fetched;
        totals.leads.upserted += r.upserted;
        if (r.completed) await setWatermark(rkey("lead"), sliceEnd, r.fetched);
      }
    } catch (err) {
      if (await handlePermissionDenied(resource, err)) {
        // Fall through to next iteration; resource is now watermarked to
        // targetEnd so `behind` won't pick it again this run.
      } else {
        throw err;
      }
    }
    chunks++;
  }

  const finalCompleted = {
    customer: await getCompletedThrough(rkey("customer"), initialDefault),
    order: await getCompletedThrough(rkey("order"), initialDefault),
    lead: await getCompletedThrough(rkey("lead"), initialDefault),
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
    skipped,
  };
}
