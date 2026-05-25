import { prisma } from "@/lib/prisma";

// MoeGo has no business-name field in the synced projection, so we label the
// known businessIds here. Anything not listed falls back to its raw id.
export const MOEGO_BUSINESS_LABELS: Record<string, string> = {
  bizVdfk: "Planet Pooch",
  biz3pcO: "Planet Pooch Pet Resort",
};

export type MoegoBusinessOption = { id: string; label: string };

export function labelForBusiness(id: string): string {
  return MOEGO_BUSINESS_LABELS[id] ?? id;
}

// Distinct businesses that actually have order data — labelled ones first
// (in declared order), then any unknown ids. The legacy null-business bucket
// is excluded.
export async function listMoegoBusinesses(): Promise<MoegoBusinessOption[]> {
  const rows = await prisma.moegoOrder.findMany({
    where: { businessId: { not: null } },
    distinct: ["businessId"],
    select: { businessId: true },
  });
  const ids = rows
    .map((r) => r.businessId)
    .filter((b): b is string => Boolean(b));
  const known = Object.keys(MOEGO_BUSINESS_LABELS).filter((id) => ids.includes(id));
  const unknown = ids.filter((id) => !(id in MOEGO_BUSINESS_LABELS)).sort();
  return [...known, ...unknown].map((id) => ({ id, label: labelForBusiness(id) }));
}
