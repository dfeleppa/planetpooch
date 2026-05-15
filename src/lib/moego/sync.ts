import { prisma } from "@/lib/prisma";
import {
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

async function getWatermark(resource: string): Promise<Date> {
  const row = await prisma.moegoSyncState.findUnique({ where: { resource } });
  if (row) {
    return new Date(row.lastSyncedAt.getTime() - OVERLAP_MINUTES * 60_000);
  }
  return new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
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

async function syncOrders(start: Date, end: Date): Promise<ResourceResult> {
  const rows: MoegoOrderRow[] = await listOrders({
    lastUpdatedTime: {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  });

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

async function syncLeads(start: Date, end: Date): Promise<ResourceResult> {
  const rows: MoegoLeadRow[] = await listLeads({
    lastUpdatedTime: {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    },
  });

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
 * Run an incremental sync of all three MoeGo resources. Each resource has
 * its own watermark so a partial failure (e.g. orders 500s) doesn't
 * advance the other resources' cursors.
 */
export async function syncAll(): Promise<SyncResult> {
  const end = new Date();
  const customerStart = await getWatermark("customer");
  const customers = await syncCustomers(customerStart, end);
  await setWatermark("customer", end, customers.fetched);

  const orderStart = await getWatermark("order");
  const orders = await syncOrders(orderStart, end);
  await setWatermark("order", end, orders.fetched);

  const leadStart = await getWatermark("lead");
  const leads = await syncLeads(leadStart, end);
  await setWatermark("lead", end, leads.fetched);

  const leadSourceMatched = await attributeLeadSources();

  return {
    windowStart: customerStart.toISOString(),
    windowEnd: isoNow(),
    customers,
    orders,
    leads,
    leadSourceMatched,
  };
}
