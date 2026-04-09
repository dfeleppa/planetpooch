"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewInventoryItemForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("units");
  const [currentQuantity, setCurrentQuantity] = useState("0");
  const [minimumThreshold, setMinimumThreshold] = useState("0");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/maintenance/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          unit,
          currentQuantity: Number(currentQuantity),
          minimumThreshold: Number(minimumThreshold),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create item");
      }
      const item = await res.json();
      router.push(`/maintenance/inventory/${item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4">
          <Input
            label="Item Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., UV Bulbs"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional..."
            />
          </div>
          <Input
            label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g., bulbs, gallons, filters"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Current Quantity"
              type="number"
              min={0}
              value={currentQuantity}
              onChange={(e) => setCurrentQuantity(e.target.value)}
            />
            <Input
              label="Minimum Threshold"
              type="number"
              min={0}
              value={minimumThreshold}
              onChange={(e) => setMinimumThreshold(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>{saving ? "Adding..." : "Add Item"}</Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
