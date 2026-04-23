"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
}

interface Requirement {
  inventoryItemId: string;
  quantityRequired: number;
}

interface Props {
  scheduleId: string;
  isActive: boolean;
  inventoryItems: InventoryItem[];
  currentRequirements: Requirement[];
}

export function ScheduleActions({ scheduleId, isActive, inventoryItems, currentRequirements }: Props) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [editingReqs, setEditingReqs] = useState(false);
  const [requirements, setRequirements] = useState<Requirement[]>(currentRequirements);
  const [saving, setSaving] = useState(false);

  const generateTask = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/maintenance/schedules/${scheduleId}/generate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate task");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error generating task");
    } finally {
      setGenerating(false);
    }
  };

  const toggleActive = async () => {
    await fetch(`/api/maintenance/schedules/${scheduleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    router.refresh();
  };

  const saveRequirements = async () => {
    setSaving(true);
    try {
      await fetch(`/api/maintenance/schedules/${scheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirements }),
      });
      setEditingReqs(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const addRequirement = () => {
    if (inventoryItems.length === 0) return;
    setRequirements((prev) => [...prev, { inventoryItemId: inventoryItems[0].id, quantityRequired: 1 }]);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setEditingReqs(!editingReqs)}>
        Edit Requirements
      </Button>
      <Button variant="secondary" size="sm" onClick={toggleActive}>
        {isActive ? "Deactivate" : "Activate"}
      </Button>
      <Button size="sm" onClick={generateTask} disabled={generating || !isActive}>
        {generating ? "Generating..." : "Generate Next Task"}
      </Button>

      {editingReqs && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-base font-semibold mb-4">Edit Inventory Requirements</h3>
            <div className="space-y-2 mb-4">
              {requirements.map((req, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={req.inventoryItemId}
                    onChange={(e) =>
                      setRequirements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, inventoryItemId: e.target.value } : r)
                      )
                    }
                  >
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </Select>
                  <input
                    type="number"
                    min={1}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    value={req.quantityRequired}
                    onChange={(e) =>
                      setRequirements((prev) =>
                        prev.map((r, idx) => idx === i ? { ...r, quantityRequired: Number(e.target.value) } : r)
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRequirements((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addRequirement} className="mb-4">
              + Add Item
            </Button>
            <div className="flex gap-2">
              <Button onClick={saveRequirements} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => { setEditingReqs(false); setRequirements(currentRequirements); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
