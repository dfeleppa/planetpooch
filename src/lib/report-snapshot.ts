const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

export function isReportFromEarlierDay(generatedAt: string, now: Date): boolean {
  return reportDate.format(new Date(generatedAt)) < reportDate.format(now);
}

export function formatSnapshotTime(generatedAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(generatedAt));
}
