"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Status =
  | { ok: true; account: { id: string; name: string; currency: string; timezone: string } }
  | { ok: false; kind: "config" | "api" | "unknown"; error: string };

/**
 * Two pieces in one component because they share state: the connection
 * status banner reflects the same Meta config the refresh button hits.
 * Refresh failures often mean the config is broken — when that happens we
 * re-fetch status to update the banner.
 */
export function PerformanceActions() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/marketing/performance/status");
      const data = (await res.json()) as Status;
      setStatus(data);
    } catch (err) {
      setStatus({
        ok: false,
        kind: "unknown",
        error: err instanceof Error ? err.message : "Failed to load status",
      });
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const res = await fetch("/api/marketing/performance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      const data = (await res.json()) as
        | {
            rowsFetched: number;
            rowsUpserted: number;
            linkedToScripts: number;
            windowSince: string;
            windowUntil: string;
          }
        | { error: string };
      if (!res.ok) {
        setRefreshMessage(
          "error" in data ? data.error : `Refresh failed (${res.status})`
        );
        // Re-check status so the banner reflects whatever just broke.
        void loadStatus();
        return;
      }
      if ("rowsFetched" in data) {
        setRefreshMessage(
          `Synced ${data.rowsFetched} rows (${data.windowSince} → ${data.windowUntil}, ${data.linkedToScripts} linked).`
        );
        router.refresh();
      }
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-2">
      <div className="flex items-center gap-2">
        <ConnectionBadge status={status} loading={loadingStatus} />
        <Button onClick={handleRefresh} disabled={refreshing} size="sm">
          {refreshing ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>
      {refreshMessage && (
        <p className="text-xs text-gray-600 max-w-md sm:text-right">
          {refreshMessage}
        </p>
      )}
      {status && !status.ok && (
        <p className="text-xs text-red-600 max-w-md sm:text-right">
          {status.error}
        </p>
      )}
    </div>
  );
}

function ConnectionBadge({
  status,
  loading,
}: {
  status: Status | null;
  loading: boolean;
}) {
  if (loading || !status) {
    return <Badge variant="default">checking…</Badge>;
  }
  if (status.ok) {
    return (
      <Badge variant="success">
        ● {status.account.name} ({status.account.currency})
      </Badge>
    );
  }
  return <Badge variant="danger">● not connected</Badge>;
}
