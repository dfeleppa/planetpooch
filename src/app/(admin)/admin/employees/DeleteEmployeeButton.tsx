"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteEmployeeButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const confirmed = confirm(
      `Delete ${employeeName}? This removes their account and all training progress. This cannot be undone.`
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete employee");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to delete employee");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors flex-shrink-0"
      title="Delete employee"
    >
      {loading ? "Deleting…" : "🗑️ Delete"}
    </button>
  );
}
