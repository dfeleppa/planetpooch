"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { DateInput } from "@/components/ui/DateInput";

type Company = "RESORT" | "GROOMING";

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  company: Company;
}

interface Requirement {
  inventoryItemId: string;
  quantityRequired: number;
}

export function NewScheduleForm({
  inventoryItems,
  initialCompany,
}: {
  inventoryItems: InventoryItem[];
  initialCompany: Company;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [company, setCompany] = useState<Company>(initialCompany);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurrenceInterval, setRecurrenceInterval] = useState("YEARLY");
  const [customIntervalDays, setCustomIntervalDays] = useState("");
  const [startDate, setStartDate] = useState("");
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  const filteredItems = inventoryItems.filter((i) => i.company === company);

  const addRequirement = () => {
    if (filteredItems.length === 0) return;
    setRequirements((prev) => [
      ...prev,
      { inventoryItemId: filteredItems[0].id, quantityRequired: 1 },
    ]);
  };

  const updateRequirement = (index: number, field: keyof Requirement, value: string | number) => {
    setRequirements((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const removeRequirement = (index: number) => {
    setRequirements((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/maintenance/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          recurrenceInterval,
          customIntervalDays: recurrenceInterval === "CUSTOM" ? Number(customIntervalDays) : null,
          startDate,
          company,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create schedule");
      }

      const schedule = await res.json();

      // Add inventory requirements
      if (requirements.length > 0) {
        await fetch(`/api/maintenance/schedules/${schedule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirements }),
        });
      }

      router.push(`/maintenance/schedules/${schedule.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Company</label>
            <select
              value={company}
              onChange={(e) => {
                setCompany(e.target.value as Company);
                setRequirements([]);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="GROOMING">Planet Pooch Mobile Grooming</option>
              <option value="RESORT">Planet Pooch Pet Resort</option>
            </select>
          </div>
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Replace UV Bulbs"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional description..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Recurrence"
              value={recurrenceInterval}
              onChange={(e) => setRecurrenceInterval(e.target.value)}
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
              <option value="CUSTOM">Custom interval</option>
            </Select>
            {recurrenceInterval === "CUSTOM" && (
              <Input
                label="Interval (days)"
                type="number"
                min={1}
                value={customIntervalDays}
                onChange={(e) => setCustomIntervalDays(e.target.value)}
                required
              />
            )}
          </div>
          <DateInput
            label="Start Date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Inventory Requirements</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addRequirement} disabled={filteredItems.length === 0}>
              + Add Item
            </Button>
          </div>
          {filteredItems.length === 0 && (
            <p className="text-xs text-gray-500">
              No inventory items for this company yet.{" "}
              <a href={`/maintenance/inventory/new?company=${company}`} className="text-blue-600 hover:underline">
                Add inventory items
              </a>{" "}
              first.
            </p>
          )}
          {requirements.length === 0 && filteredItems.length > 0 && (
            <p className="text-xs text-gray-500">No requirements added. Click "+ Add Item" to require inventory for this schedule.</p>
          )}
          <div className="space-y-2">
            {requirements.map((req, i) => {
              const item = filteredItems.find((x) => x.id === req.inventoryItemId);
              return (
                <div key={i} className="flex items-center gap-3">
                  <select
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={req.inventoryItemId}
                    onChange={(e) => updateRequirement(i, "inventoryItemId", e.target.value)}
                  >
                    {filteredItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={req.quantityRequired}
                    onChange={(e) => updateRequirement(i, "quantityRequired", Number(e.target.value))}
                  />
                  <span className="text-xs text-gray-500 w-16">{item?.unit ?? ""}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRequirement(i)}>
                    ✕
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Creating..." : "Create Schedule"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
