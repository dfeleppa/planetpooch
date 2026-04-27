"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  employeeId: string;
  employeeName: string;
  buttonClassName?: string;
}

interface ManagerOption {
  id: string;
  name: string;
  email: string;
}

export function EndEmploymentDialog({
  employeeId,
  employeeName,
  buttonClassName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Replacement-manager state. We don't fetch the picker list until the API
  // tells us the user has reports — keeps the simple case (no reports) a
  // single click.
  const [needsReplacement, setNeedsReplacement] = useState(false);
  const [reportsCount, setReportsCount] = useState(0);
  const [replacementId, setReplacementId] = useState("");
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);

  useEffect(() => {
    if (!needsReplacement || managers.length > 0) return;
    setLoadingManagers(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: ManagerOption[]) => {
        setManagers(data.filter((u) => u.id !== employeeId));
      })
      .catch(() => setError("Couldn't load replacement manager list"))
      .finally(() => setLoadingManagers(false));
  }, [needsReplacement, managers.length, employeeId]);

  function reset() {
    setDate(today);
    setReason("");
    setError("");
    setNeedsReplacement(false);
    setReportsCount(0);
    setReplacementId("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/employees/${employeeId}/end-employment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            terminatedAt: new Date(date).toISOString(),
            reason: reason.trim() || null,
            replacementManagerId: replacementId || null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresReplacement) {
          setNeedsReplacement(true);
          setReportsCount(data.reportsCount ?? 0);
          setError(data.error);
          return;
        }
        throw new Error(data.error || "Failed to end employment");
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end employment");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
        }
        title="End this employee's employment"
      >
        End Employment
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <form onSubmit={submit}>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">End Employment</h2>
            <p className="text-sm text-gray-500 mt-1">{employeeName}</p>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Last day <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                required
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400">
                Defaults to today. Back-dating is fine; future dates are not allowed.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. voluntary resignation, end of seasonal contract"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {needsReplacement && (
              <div className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <label className="text-sm font-medium text-amber-900">
                  Replacement manager <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-amber-800">
                  {employeeName} manages {reportsCount}{" "}
                  {reportsCount === 1 ? "person" : "people"}. Pick a replacement —
                  reports will be reassigned atomically.
                </p>
                <select
                  value={replacementId}
                  onChange={(e) => setReplacementId(e.target.value)}
                  required
                  disabled={loadingManagers}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1"
                >
                  <option value="">
                    {loadingManagers ? "Loading…" : "— Select a manager —"}
                  </option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && !needsReplacement && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {submitting ? "Ending…" : "End Employment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
