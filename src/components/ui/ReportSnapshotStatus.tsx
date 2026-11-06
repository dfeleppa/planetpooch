"use client";

import { useEffect, useState } from "react";
import { formatSnapshotTime, isReportFromEarlierDay } from "@/lib/report-snapshot";

export function ReportSnapshotStatus({ generatedAt }: { generatedAt: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const stale = now !== null && isReportFromEarlierDay(generatedAt, now);
  return <div className="mt-2 space-y-1 text-sm" role="status">
    <p className="text-pp-ink-3">Snapshot: {formatSnapshotTime(generatedAt)}</p>
    {stale ? <p className="font-medium text-amber-800">This report is from an earlier day. Refresh it before following up with customers.</p> : null}
    <p className="text-pp-ink-3">Counts and relative dates are as of this snapshot. Refresh report to update them.</p>
  </div>;
}
