"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface NewlySigned {
  employee: string;
  document: string;
}

interface CheckResult {
  total: number;
  checked: number;
  signed: number;
  failed: number;
  newlySigned: NewlySigned[];
}

interface Props {
  pendingCount: number;
}

export function CheckPendingEsignaturesButton({ pendingCount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");

  if (pendingCount === 0) return null;

  async function check() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/esign-requests/check-pending", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check");
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={check} disabled={busy}>
        {busy
          ? "Checking…"
          : `Check pending eSignatures (${pendingCount})`}
      </Button>
      {result && (
        <div className="text-xs text-gray-600 max-w-xs text-right">
          Checked {result.checked} of {result.total}
          {result.signed > 0 && ` · ${result.signed} newly signed`}
          {result.failed > 0 && ` · ${result.failed} failed`}
          {result.newlySigned.length > 0 && (
            <ul className="mt-1 text-gray-500">
              {result.newlySigned.map((s, i) => (
                <li key={i} className="truncate">
                  {s.employee}: {s.document}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
