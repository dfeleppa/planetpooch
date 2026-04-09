"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Requirement {
  inventoryItemId: string;
  name: string;
  unit: string;
  defaultQuantity: number;
}

export function TaskCompleteForm({ taskId, requirements }: { taskId: string; requirements: Requirement[] }) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState("");
  const [usages, setUsages] = useState(
    requirements.map((r) => ({ inventoryItemId: r.inventoryItemId, quantityUsed: r.defaultQuantity }))
  );

  const updateUsage = (index: number, qty: number) => {
    setUsages((prev) => prev.map((u, i) => (i === index ? { ...u, quantityUsed: qty } : u)));
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/maintenance/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usages, notes }),
      });
      if (!res.ok) throw new Error("Failed to complete task");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error completing task");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-gray-900">Complete This Task</h2>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {requirements.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Actual Inventory Used</p>
            <div className="space-y-2">
              {requirements.map((req, i) => (
                <div key={req.inventoryItemId} className="flex items-center gap-3">
                  <span className="text-sm text-gray-900 flex-1">{req.name}</span>
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    value={usages[i]?.quantityUsed ?? req.defaultQuantity}
                    onChange={(e) => updateUsage(i, Number(e.target.value))}
                  />
                  <span className="text-xs text-gray-500 w-16">{req.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">Notes</label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional completion notes..."
          />
        </div>
        <Button onClick={handleComplete} disabled={completing}>
          {completing ? "Completing..." : "Mark as Complete"}
        </Button>
      </CardContent>
    </Card>
  );
}
