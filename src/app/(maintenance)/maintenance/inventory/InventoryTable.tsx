"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

interface InventoryRow {
  id: string;
  name: string;
  description: string;
  unit: string;
  currentQuantity: number;
  minimumThreshold: number;
  category: { name: string; color: string };
}

export function InventoryTable({ items }: { items: InventoryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, String(i.currentQuantity)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusInput = (index: number) => {
    const el = inputRefs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  };

  useEffect(() => {
    if (editing) focusInput(0);
  }, [editing]);

  const startEditing = () => {
    setQuantities(Object.fromEntries(items.map((i) => [i.id, String(i.currentQuantity)])));
    setError("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    const changes = items
      .map((item) => {
        const next = Number(quantities[item.id]);
        if (!Number.isFinite(next) || next < 0) return null;
        const delta = next - item.currentQuantity;
        if (delta === 0) return null;
        return { id: item.id, delta };
      })
      .filter((c): c is { id: string; delta: number } => c !== null);

    if (changes.length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const results = await Promise.all(
        changes.map((c) =>
          fetch(`/api/maintenance/inventory/${c.id}/adjust`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantityChange: c.delta, reason: "Stock count" }),
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        throw new Error(`${failed} item${failed === 1 ? "" : "s"} failed to update`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save adjustments");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        {!editing ? (
          <Button variant="secondary" size="sm" onClick={startEditing}>
            Adjust Stock
          </Button>
        ) : (
          <>
            {error && <span className="text-sm text-red-600">{error}</span>}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Adjustments"}
            </Button>
            <Button variant="secondary" size="sm" onClick={cancelEditing} disabled={saving}>
              Cancel
            </Button>
          </>
        )}
      </div>
      <Table>
        <TableHead>
          <tr>
            <TableHeader>Name</TableHeader>
            <TableHeader>Category</TableHeader>
            <TableHeader>Unit</TableHeader>
            <TableHeader>On Hand</TableHeader>
            <TableHeader>Min. Threshold</TableHeader>
            <TableHeader>Status</TableHeader>
          </tr>
        </TableHead>
        <TableBody>
          {items.map((item, index) => {
            const editedQty = Number(quantities[item.id] ?? item.currentQuantity);
            const displayQty = editing && Number.isFinite(editedQty) ? editedQty : item.currentQuantity;
            const isLow = item.minimumThreshold > 0 && displayQty <= item.minimumThreshold;
            const isOut = displayQty === 0;
            const isLast = index === items.length - 1;
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/maintenance/inventory/${item.id}`} className="font-medium text-blue-600 hover:underline">
                    {item.name}
                  </Link>
                  {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.category.color}`}>
                    {item.category.name}
                  </span>
                </TableCell>
                <TableCell className="text-gray-600">{item.unit}</TableCell>
                <TableCell className="font-semibold text-gray-900">
                  {editing ? (
                    <input
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      enterKeyHint={isLast ? "done" : "next"}
                      value={quantities[item.id] ?? ""}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (isLast) {
                            e.currentTarget.blur();
                            handleSave();
                          } else {
                            focusInput(index + 1);
                          }
                        }
                      }}
                      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    item.currentQuantity
                  )}
                </TableCell>
                <TableCell className="text-gray-600">{item.minimumThreshold || "—"}</TableCell>
                <TableCell>
                  {isOut ? (
                    <Badge variant="danger">Out of stock</Badge>
                  ) : isLow ? (
                    <Badge variant="warning">Low stock</Badge>
                  ) : (
                    <Badge variant="success">OK</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
