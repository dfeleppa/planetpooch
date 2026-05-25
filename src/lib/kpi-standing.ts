import type { KpiStandingField } from "@prisma/client";

// A standing-value row: "from effectiveWeekStart onward, `field` is `amount`."
export type StandingRow = {
  metricKey: string;
  field: KpiStandingField;
  amount: number | null;
  effectiveWeekStart: Date;
};

// The value in effect for a metric+field at `week`: the most recent row whose
// effectiveWeekStart is on or before `week`. Returns null when nothing applies
// yet, or when the latest applicable row explicitly cleared the field.
export function resolveStandingAmount(
  rows: StandingRow[],
  metricKey: string,
  field: KpiStandingField,
  week: Date,
): number | null {
  let bestTime = -Infinity;
  let best: number | null = null;
  const weekTime = week.getTime();
  for (const r of rows) {
    if (r.metricKey !== metricKey || r.field !== field) continue;
    const t = r.effectiveWeekStart.getTime();
    if (t <= weekTime && t > bestTime) {
      bestTime = t;
      best = r.amount;
    }
  }
  return best;
}

// Whether a metric+field has ever been set (any effective week). Used to decide
// the one-time backfill on the first time a target/average is established.
export function hasStanding(
  rows: StandingRow[],
  metricKey: string,
  field: KpiStandingField,
): boolean {
  return rows.some((r) => r.metricKey === metricKey && r.field === field);
}
