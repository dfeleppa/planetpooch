export type TipHours = { employeeId: string; hoursHundredths: number };

/** Allocate whole cents by worked hours, assigning leftover cents by largest remainder. */
export function allocateTipCents(totalCents: number, rows: TipHours[]) {
  const totalHours = rows.reduce((sum, row) => sum + row.hoursHundredths, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalHours <= 0 || !Number.isSafeInteger(totalHours) ||
      rows.some((row) => !Number.isSafeInteger(row.hoursHundredths) || row.hoursHundredths < 0)) {
    throw new Error("Enter a valid tip total and at least one employee with hours worked.");
  }
  const shares = rows.map((row, index) => {
    const numerator = totalCents * row.hoursHundredths;
    if (!Number.isSafeInteger(numerator)) throw new Error("Tip amount or hours are too large.");
    return { ...row, index, amountCents: Math.floor(numerator / totalHours), remainder: numerator % totalHours };
  });
  let remaining = totalCents - shares.reduce((sum, row) => sum + row.amountCents, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- <= 0) break;
    share.amountCents += 1;
  }
  return shares.map(({ employeeId, hoursHundredths, amountCents }) => ({ employeeId, hoursHundredths, amountCents }));
}
