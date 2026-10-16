"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  name: string;
  currentQuantity: number;
  minimumThreshold: number;
  category: { name: string; color: string };
  counts: { id: string; quantity: number; countedAt: string }[];
};

const categoryOrder = [
  "Shampoos & Finishing Spray",
  "Ear & Eye Care",
  "Dental Care",
  "Nail & Paw Care",
  "Miscellaneous",
];

export function GroomingInventory({ items, canManage }: { items: Item[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [onHand, setOnHand] = useState<Record<string, string>>({});
  const [required, setRequired] = useState<Record<string, string>>({});
  const [touchedCounts, setTouchedCounts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);

  const categories = [...new Set(items.map((item) => item.category.name))].sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.localeCompare(b);
  });

  function startEditing() {
    setOnHand(Object.fromEntries(items.map((item) => [item.id, String(item.currentQuantity)])));
    setRequired(Object.fromEntries(items.map((item) => [item.id, String(item.minimumThreshold)])));
    setTouchedCounts([]);
    setError("");
    setEditing(true);
  }

  function adjustOnHand(itemId: string, amount: -1 | 1) {
    const current = Number(onHand[itemId]);
    const next = current + amount;
    if (!Number.isSafeInteger(current) || !Number.isSafeInteger(next) || next < 0) return;
    setOnHand((previous) => ({ ...previous, [itemId]: String(next) }));
    setTouchedCounts((previous) => previous.includes(itemId) ? previous : [...previous, itemId]);
  }

  async function save() {
    const changedRequirements = items.filter((item) => required[item.id] !== String(item.minimumThreshold));
    const changedCounts = items.filter((item) => touchedCounts.includes(item.id));
    const values = [...changedRequirements.map((item) => required[item.id]), ...changedCounts.map((item) => onHand[item.id])];
    if (values.some((value) => value === "" || !Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
      setError("Enter nonnegative whole numbers for On Hand and Req Quantity.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      for (const item of changedCounts) {
        const response = await fetch(`/api/maintenance/inventory/${item.id}/count`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: Number(onHand[item.id]) }),
        });
        if (!response.ok) throw new Error(`Could not save count for ${item.name}`);
      }
      for (const item of changedRequirements) {
        const response = await fetch(`/api/maintenance/inventory/${item.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minimumThreshold: Number(required[item.id]) }),
        });
        if (!response.ok) throw new Error(`Could not save required quantity for ${item.name}`);
      }
      setEditing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save inventory");
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="pp-grooming-screen">
        <div className="flex items-center justify-end gap-2">
          {error && <p role="alert" className="mr-auto text-sm text-red-600">{error}</p>}
          <Button type="button" size="sm" variant="secondary" disabled={editing || saving} onClick={() => window.print()}>Print / PDF</Button>
          {canManage && (editing ? (
            <>
              <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save counts"}</Button>
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
            </>
          ) : <Button size="sm" variant="secondary" onClick={startEditing}>Edit counts</Button>)}
        </div>
      {categories.map((category) => (
        <section key={category} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-base font-semibold text-gray-900">{category}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <colgroup><col className="w-[46%]" /><col className="w-[23%]" /><col className="w-[17%]" /><col className="w-[14%]" /></colgroup>
              <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th scope="col" className="px-4 py-3">Item</th>
                <th scope="col" className="px-3 py-3">On Hand</th>
                <th scope="col" className="px-3 py-3">Req Quantity</th>
                <th scope="col" className="px-3 py-3">History</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {items.filter((item) => item.category.name === category).map((item) => (
                  <Fragment key={item.id}>
                  <tr>
                    <td className="break-words px-4 py-3 font-medium"><Link href={`/maintenance/inventory/${item.id}`} className="text-blue-700 hover:underline">{item.name}</Link></td>
                    <td className="px-3 py-3">
                      {editing ? <div className="flex items-center gap-1 whitespace-nowrap">
                        <button type="button" aria-label={`Decrease ${item.name} on hand`} disabled={saving || Number(onHand[item.id]) <= 0} onClick={() => adjustOnHand(item.id, -1)} className="rounded border border-gray-300 px-2 py-1 font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40">−</button>
                        <input aria-label={`${item.name} on hand`} type="number" min="0" step="1" inputMode="numeric" className="w-16 rounded border border-gray-300 px-2 py-1" value={onHand[item.id] ?? ""} onChange={(event) => { setOnHand((previous) => ({ ...previous, [item.id]: event.target.value })); setTouchedCounts((previous) => previous.includes(item.id) ? previous : [...previous, item.id]); }} />
                        <button type="button" aria-label={`Increase ${item.name} on hand`} disabled={saving || Number(onHand[item.id]) >= Number.MAX_SAFE_INTEGER} onClick={() => adjustOnHand(item.id, 1)} className="rounded border border-gray-300 px-2 py-1 font-semibold hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40">+</button>
                      </div> : item.id.startsWith("mg-item-") && item.counts.length === 0 && item.currentQuantity === 0 ? "—" : item.currentQuantity}
                    </td>
                    <td className="px-3 py-3">
                      {editing ? <input aria-label={`${item.name} required quantity`} type="number" min="0" step="1" inputMode="numeric" className="w-20 rounded border border-gray-300 px-2 py-1" value={required[item.id] ?? ""} onChange={(event) => setRequired((previous) => ({ ...previous, [item.id]: event.target.value }))} /> : item.id.startsWith("mg-item-") && item.minimumThreshold === 0 ? "—" : item.minimumThreshold}
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" aria-expanded={expanded.includes(item.id)} onClick={() => setExpanded((previous) => previous.includes(item.id) ? previous.filter((id) => id !== item.id) : [...previous, item.id])} className="text-blue-700 hover:underline">{expanded.includes(item.id) ? "Hide history" : "View history"}</button>
                    </td>
                  </tr>
                  {expanded.includes(item.id) && <tr className="bg-gray-50"><td colSpan={4} className="px-4 py-3">
                    {item.counts.length ? <ul className="max-w-xs space-y-1 text-gray-700">{item.counts.map((count) => <li key={count.id} className="flex justify-between gap-4"><time dateTime={count.countedAt}>{new Date(count.countedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}</time><strong>{count.quantity}</strong></li>)}</ul> : <p className="text-gray-500">No counts yet</p>}
                  </td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      </div>
      <div className="pp-grooming-print" aria-hidden="true">
        <header className="pp-grooming-print-header">
          <h1>Mobile Grooming Inventory</h1>
          <p>On hand and required quantities</p>
        </header>
        <table>
          <colgroup><col style={{ width: "72%" }} /><col style={{ width: "14%" }} /><col style={{ width: "14%" }} /></colgroup>
          <thead><tr><th scope="col">Item</th><th scope="col">On Hand</th><th scope="col">Req Qty</th></tr></thead>
          {categories.map((category) => (
            <tbody key={category}>
              <tr className="pp-grooming-print-category"><th scope="rowgroup" colSpan={3}>{category}</th></tr>
              {items.filter((item) => item.category.name === category).map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.id.startsWith("mg-item-") && item.counts.length === 0 && item.currentQuantity === 0 ? "—" : item.currentQuantity}</td>
                  <td>{item.id.startsWith("mg-item-") && item.minimumThreshold === 0 ? "—" : item.minimumThreshold}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
