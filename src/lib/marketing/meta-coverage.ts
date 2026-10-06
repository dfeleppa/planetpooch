/** Successful sync windows also prove coverage for dates with zero ad rows. */
export function coversMetaPeriod(
  from: Date,
  toExclusive: Date,
  windows: { since: Date; until: Date }[],
): boolean {
  let coveredUntil = from.getTime();
  for (const window of [...windows].sort((a, b) => a.since.getTime() - b.since.getTime())) {
    if (window.until.getTime() < coveredUntil) continue;
    if (window.since.getTime() > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, window.until.getTime() + 86_400_000);
    if (coveredUntil >= toExclusive.getTime()) return true;
  }
  return false;
}
