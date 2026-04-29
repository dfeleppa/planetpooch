"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Company = "RESORT" | "GROOMING" | "CORPORATE";

interface Category {
  id: string;
  name: string;
  company: Company;
}

interface InitialValues {
  name: string;
  description: string;
  categoryId: string;
  unit: string;
  minimumThreshold: number;
}

export function InventoryItemActions({
  itemId,
  company,
  initial,
}: {
  itemId: string;
  company: Company;
  initial: InitialValues;
}) {
  const router = useRouter();
  const [showAdjust, setShowAdjust] = useState(false);
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [unit, setUnit] = useState(initial.unit);
  const [minimumThreshold, setMinimumThreshold] = useState(String(initial.minimumThreshold));
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!showEdit) return;
    let cancelled = false;
    setLoadingCategories(true);
    fetch(`/api/maintenance/inventory-categories?company=${company}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load categories"))))
      .then((data: Category[]) => {
        if (!cancelled) setCategories(data);
      })
      .catch((err) => {
        if (!cancelled) setEditError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showEdit, company]);

  const handleAdjust = async () => {
    if (!quantityChange || Number(quantityChange) === 0) return;
    setAdjusting(true);
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
      setAdjusting(false);
    }
  };

  const handleEdit = async () => {
    setEditError("");
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/maintenance/inventory/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          categoryId,
          unit,
          minimumThreshold: Number(minimumThreshold),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update item");
      }
      setShowEdit(false);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error updating item");
    } finally {
      setSavingEdit(false);
    }
  };

  const resetEdit = () => {
    setName(initial.name);
    setDescription(initial.description);
    setCategoryId(initial.categoryId);
    setUnit(initial.unit);
    setMinimumThreshold(String(initial.minimumThreshold));
    setEditError("");
    setShowEdit(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
        Edit Item
      </Button>
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
              <Button onClick={handleAdjust} disabled={adjusting || !quantityChange}>
                {adjusting ? "Saving..." : "Save Adjustment"}
              </Button>
              <Button variant="secondary" onClick={() => setShowAdjust(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold mb-4">Edit Item</h3>
            <div className="space-y-3 mb-4">
              <Input
                label="Item Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea
                  rows={2}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loadingCategories}
                >
                  {loadingCategories && categories.length === 0 ? (
                    <option value={categoryId}>Loading...</option>
                  ) : (
                    categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <Input
                label="Unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
              <Input
                label="Minimum Threshold"
                type="number"
                min={0}
                value={minimumThreshold}
                onChange={(e) => setMinimumThreshold(e.target.value)}
              />
              {editError && <p className="text-sm text-red-600">{editError}</p>}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleEdit} disabled={savingEdit || !name.trim() || !categoryId}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="secondary" onClick={resetEdit}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
