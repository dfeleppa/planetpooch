export type CustomerPayment = { customerKey: string; netPaidCents: number };

export function conversionEfficiency(spendCents: number | null, leads: number | null, conversions: number | null) {
  return {
    costPerConversion: spendCents !== null && conversions !== null && conversions > 0 ? spendCents / conversions : null,
    conversionRate: leads !== null && leads > 0 && conversions !== null ? conversions / leads : null,
  };
}

/** Each verified customer counts once, even across repeat forms or campaigns. */
export function conversionMetrics(payments: CustomerPayment[], available: boolean) {
  if (!available) return { conversions: null, valuePerConversion: null };
  const customers = new Map<string, number>();
  for (const row of payments) customers.set(row.customerKey, (customers.get(row.customerKey) ?? 0) + row.netPaidCents);
  const converted = [...customers.values()].filter((amount) => amount > 0);
  return { conversions: converted.length, valuePerConversion: converted.length ? converted.reduce((sum, amount) => sum + amount, 0) / converted.length : null };
}

/** Merge only already-verified profile IDs, never phone-only household matches. */
export function conversionCustomerKeys(rows: { id: string; customerIds: ReadonlySet<string> }[]) {
  const parents = new Map<string, string>();
  const root = (id: string): string => {
    const parent = parents.get(id);
    if (!parent || parent === id) return id;
    const resolved = root(parent);
    parents.set(id, resolved);
    return resolved;
  };
  for (const row of rows) {
    const ids = [...row.customerIds];
    for (const id of ids) parents.set(root(id), root(ids[0]));
  }
  return new Map(rows.map((row) => [row.id, row.customerIds.size ? root([...row.customerIds][0]) : `submission:${row.id}`]));
}
