"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EndEmploymentDialog } from "../EndEmploymentDialog";

interface Props {
  employeeId: string;
  employeeName: string;
  isTerminated: boolean;
  isSuperAdmin: boolean;
}

export function DangerZoneCard({
  employeeId,
  employeeName,
  isTerminated,
  isSuperAdmin,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reactivate" | "delete" | null>(null);
  const [error, setError] = useState("");

  async function reactivate() {
    if (!confirm(
      `Reactivate ${employeeName}? This restores their login access. Their previous data is intact.`
    )) return;
    setBusy("reactivate");
    setError("");
    try {
      const res = await fetch(
        `/api/employees/${employeeId}/reactivate`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reactivate");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reactivate");
    } finally {
      setBusy(null);
    }
  }

  async function permanentDelete() {
    if (!confirm(
      `Permanently delete the database row for ${employeeName}? The Drive folder will be preserved. This cannot be undone.`
    )) return;
    setBusy("delete");
    setError("");
    try {
      const res = await fetch(
        `/api/employees/${employeeId}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      // Bounce back to the employees list — we just deleted this page's
      // subject so refresh would 404.
      router.push("/admin/employees");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setBusy(null);
    }
  }

  return (
    <Card className="border-red-200">
      <CardHeader>
        <h2 className="font-semibold text-red-700">Danger Zone</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isTerminated && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              <p className="font-medium">End employment</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Marks this employee as a past employee. Their record, training
                progress, and Drive folder are preserved. They can no longer
                log in.
              </p>
            </div>
            <EndEmploymentDialog
              employeeId={employeeId}
              employeeName={employeeName}
              buttonClassName="px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors flex-shrink-0"
            />
          </div>
        )}

        {isTerminated && isSuperAdmin && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              <p className="font-medium">Reactivate employee</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Restores login access. Reports who were already reassigned stay with their new manager.
              </p>
            </div>
            <Button
              type="button"
              onClick={reactivate}
              disabled={busy !== null}
            >
              {busy === "reactivate" ? "Reactivating…" : "Reactivate"}
            </Button>
          </div>
        )}

        {isTerminated && isSuperAdmin && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-red-100">
            <div className="text-sm text-gray-700">
              <p className="font-medium">Permanently delete record</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Removes the database row. Drive folder is preserved. Use only
                when you're certain — this is irreversible.
              </p>
            </div>
            <Button
              type="button"
              variant="danger"
              onClick={permanentDelete}
              disabled={busy !== null}
            >
              {busy === "delete" ? "Deleting…" : "Permanently delete"}
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
