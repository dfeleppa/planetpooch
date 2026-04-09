"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InventoryItemActions({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [showAdjust, setShowAdjust] = useState(false);
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdjust = async () => {
    if (!quantityChange || Number(quantityChange) === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/maintenance/inventory/${itemId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantityChange: Number(quantityChange), reason }),
      });
      if (!res.ok) throw new Error("Failed to adjust inventory");
      setShowAdjust(false);
      setQuantityChange("");
      setReason("");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error adjusting inventory");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setShowAdjust(true)}>
        Adjust Stock
      </Button>

      {showAdjust && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold mb-4">Adjust Stock</h3>
            <div className="space-y-3 mb-4">
              <Input
                label="Quantity Change (+ or -)"
                type="number"
                value={quantityChange}
                onChange={(e) => setQuantityChange(e.target.value)}
                placeholder="e.g., 8 or -3"
              />
              <Input
                label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Received shipment"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdjust} disabled={saving || !quantityChange}>
                {saving ? "Saving..." : "Save Adjustment"}
              </Button>
              <Button variant="secondary" onClick={() => setShowAdjust(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
