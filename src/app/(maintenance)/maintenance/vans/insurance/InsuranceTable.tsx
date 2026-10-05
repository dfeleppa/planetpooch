"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { number: number; year: number | null; make: string; model: string; vin: string; carrier: string; deductible: string; premium: string };

export function InsuranceTable({ vans, canEdit }: { vans: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(vans);
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const totalPremium = rows.reduce((total, row) => {
    const premium = Number(row.premium);
    return row.premium.trim() && Number.isFinite(premium) ? total + Math.round(premium * 100) : total;
  }, 0) / 100;
  function update(number: number, key: "carrier" | "deductible" | "premium", value: string) {
    setRows(current => current.map(row => row.number === number ? { ...row, [key]: value } : row));
  }
  async function save(row: Row) {
    setSaving(row.number); setMessage("");
    try {
      const response = await fetch(`/api/maintenance/vans/${row.number}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insuranceOnly: true, insuranceCarrier: row.carrier, insuranceDeductible: row.deductible, insurancePremium: row.premium }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save insurance");
      setMessage(`Van ${row.number} insurance saved.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save insurance"); }
    finally { setSaving(null); }
  }
  return <div>
    {message && <p role="status" className="mb-4 text-sm text-gray-700">{message}</p>}
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[1050px] divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-gray-700"><tr>
          <th scope="col" className="px-4 py-3">Van</th><th scope="col" className="px-4 py-3">Year</th>
          <th scope="col" className="px-4 py-3">Make</th><th scope="col" className="px-4 py-3">Model</th><th scope="col" className="px-4 py-3">VIN</th>
          <th scope="col" className="px-4 py-3">Insurance carrier</th><th scope="col" className="px-4 py-3">Deductible ($)</th>
          <th scope="col" className="px-4 py-3">Premium ($)</th>{canEdit && <th scope="col" className="px-4 py-3">Action</th>}
        </tr></thead>
        <tbody className="divide-y divide-gray-100">{rows.map(row => <tr key={row.number}>
          <td className="whitespace-nowrap px-4 py-3 font-medium"><Link className="text-blue-700 hover:underline" href={`/maintenance/vans/${row.number}`}>Van {row.number}</Link></td>
          <td className="px-4 py-3">{row.year ?? "—"}</td><td className="px-4 py-3">{row.make || "—"}</td><td className="px-4 py-3">{row.model || "—"}</td>
          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{row.vin ? row.vin.length === 4 ? `Last 4: ${row.vin}` : row.vin : "—"}</td>
          {canEdit ? <>
            <td className="px-4 py-3"><input aria-label={`Van ${row.number} insurance carrier`} className="w-40 rounded border border-gray-300 px-2 py-1" value={row.carrier} onChange={event => update(row.number, "carrier", event.target.value)} /></td>
            <td className="px-4 py-3"><input aria-label={`Van ${row.number} deductible`} type="number" min="0" step="0.01" className="w-28 rounded border border-gray-300 px-2 py-1" value={row.deductible} onChange={event => update(row.number, "deductible", event.target.value)} /></td>
            <td className="px-4 py-3"><input aria-label={`Van ${row.number} premium`} type="number" min="0" step="0.01" className="w-28 rounded border border-gray-300 px-2 py-1" value={row.premium} onChange={event => update(row.number, "premium", event.target.value)} /></td>
            <td className="px-4 py-3"><button type="button" disabled={saving !== null} onClick={() => void save(row)} className="rounded bg-pp-accent px-3 py-1 font-medium text-white disabled:opacity-50">{saving === row.number ? "Saving…" : "Save"}</button></td>
          </> : <><td className="px-4 py-3">{row.carrier || "—"}</td><td className="px-4 py-3">{row.deductible ? `$${Number(row.deductible).toFixed(2)}` : "—"}</td><td className="px-4 py-3">{row.premium ? `$${Number(row.premium).toFixed(2)}` : "—"}</td></>}
        </tr>)}</tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
          <tr>
            <th scope="row" colSpan={7} className="px-4 py-3 text-right">Total premiums</th>
            <td className="whitespace-nowrap px-4 py-3">{totalPremium.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>
            {canEdit && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  </div>;
}
