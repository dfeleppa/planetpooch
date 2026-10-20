import { prisma } from "@/lib/prisma";

export const GOOGLE_LSA_LEAD_COST_CENTS = 2_800;

type LsaLead = {
  id: string;
  business: string;
  customer: string | null;
  jobType: string | null;
  searchIntent: string | null;
  location: string | null;
  leadType: string | null;
  leadReceived: string | null;
  updatedAt: Date;
  rowOrder: number;
  periodStart: Date;
  periodEnd: Date;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function lsaLeadDay(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const named = /^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/.exec(trimmed);
  const day = iso?.[3] ?? named?.[2]?.padStart(2, "0");
  const month = iso?.[2] ?? MONTHS[named?.[1]?.toLowerCase() ?? ""];
  const year = iso?.[1] ?? named?.[3];
  if (!day || !month || !year) return null;
  const result = `${year}-${month}-${day}`;
  const date = new Date(`${result}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === result ? result : null;
}

function identity(row: LsaLead, day: string): string {
  const customer = row.customer?.trim();
  // A blank caller cannot be matched reliably across separate CSV snapshots.
  const caller = customer ? customer.replace(/\D/g, "") || customer.toLowerCase() : row.id;
  return [row.business, day, caller, row.jobType, row.searchIntent, row.location, row.leadType]
    .map((value) => (value ?? "").trim().toLowerCase())
    .join("|");
}

export function leadsInPeriod<T extends LsaLead>(rows: T[], from: string, to: string): T[] {
  const seen = new Set<string>();
  const snapshotOccurrences = new Map<string, number>();
  return rows
    .map((row) => ({ row, day: lsaLeadDay(row.leadReceived) }))
    .filter((item): item is { row: T; day: string } => Boolean(item.day && item.day >= from && item.day <= to))
    .sort((a, b) => b.row.updatedAt.getTime() - a.row.updatedAt.getTime() || a.row.rowOrder - b.row.rowOrder)
    .filter(({ row, day }) => {
      const snapshot = `${row.business}|${row.periodStart.toISOString()}|${row.periodEnd.toISOString()}`;
      const lead = identity(row, day);
      const occurrenceKey = `${snapshot}|${lead}`;
      const occurrence = (snapshotOccurrences.get(occurrenceKey) ?? 0) + 1;
      snapshotOccurrences.set(occurrenceKey, occurrence);
      const key = `${lead}|${occurrence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.day.localeCompare(a.day) || a.row.rowOrder - b.row.rowOrder)
    .map(({ row }) => row);
}

export async function getGoogleLsaLeads(businesses: string[], from: Date, to: Date) {
  const rows = await prisma.financeGoogleLsaLeadReportRow.findMany({
    where: {
      business: { in: businesses },
      periodStart: { lte: to },
      periodEnd: { gte: from },
    },
  });
  return leadsInPeriod(rows, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
}
