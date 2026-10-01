"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Van = {
  year: number | null; make: string; model: string; vin: string; licensePlate: string;
  mileage: number | null; status: string; registrationExpiry: string; insuranceExpiry: string;
  insuranceCarrier: string; insuranceDeductible: string; insurancePremium: string;
  inspectionExpiry: string; notes: string;
};
type RecordRow = {
  id: string; serviceDate: string; category: string; description: string; mileage: number | null;
  vendor: string | null; cost: string | null; nextDueDate: string | null;
  nextDueMileage: number | null; notes: string;
  invoiceNumber: string | null; workOrderNumber: string | null; subtotal: string | null;
  tax: string | null; amountPaid: string | null; balanceDue: string | null; sourceFileName: string | null;
};

const fieldClass = "block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const dateLabel = (value: string | null) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—";
const emptyRecord = { serviceDate: "", category: "Routine service", description: "", mileage: "", vendor: "", cost: "", nextDueDate: "", nextDueMileage: "", notes: "", invoiceNumber: "", workOrderNumber: "", subtotal: "", tax: "", amountPaid: "", balanceDue: "" };
type SortKey = "serviceDate" | "description" | "category" | "vendor" | "mileage" | "cost" | "nextDueDate" | "invoiceNumber" | "sourceFileName";
type SortDirection = "asc" | "desc";

const columns: { key: SortKey; label: string }[] = [
  { key: "serviceDate", label: "Service date" },
  { key: "description", label: "Maintenance completed" },
  { key: "category", label: "Category" },
  { key: "vendor", label: "Vendor" },
  { key: "mileage", label: "Mileage" },
  { key: "cost", label: "Cost" },
  { key: "nextDueDate", label: "Next due" },
  { key: "invoiceNumber", label: "Invoice" },
  { key: "sourceFileName", label: "Document" },
];

function sortValue(row: RecordRow, key: SortKey): string | number | null {
  if (key === "cost") return row.cost === null ? null : Number(row.cost);
  const value = row[key];
  return value === "" ? null : value;
}

export function VanEditor({ number, van, records, canEdit }: { number: number; van: Van; records: RecordRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState(van);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [record, setRecord] = useState(emptyRecord);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "serviceDate", direction: "desc" });
  const sortedRecords = [...records].sort((a, b) => {
    const first = sortValue(a, sort.key);
    const second = sortValue(b, sort.key);
    if (first === null) return second === null ? b.serviceDate.localeCompare(a.serviceDate) || a.id.localeCompare(b.id) : 1;
    if (second === null) return -1;
    const comparison = typeof first === "number" && typeof second === "number"
      ? first - second
      : String(first).localeCompare(String(second), undefined, { sensitivity: "base", numeric: true });
    return (sort.direction === "asc" ? comparison : -comparison) || b.serviceDate.localeCompare(a.serviceDate) || a.id.localeCompare(b.id);
  });

  function sortBy(key: SortKey) {
    setSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSuccess(""); setSaving(true);
    try {
      const response = await fetch(`/api/maintenance/vans/${number}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save vehicle details");
      setSuccess("Vehicle details saved."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save vehicle details"); }
    finally { setSaving(false); }
  }

  async function saveRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setError(""); setSuccess(""); setAdding(true);
    try {
      const response = await fetch(`/api/maintenance/vans/${number}/records/${editingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update maintenance record");
      setRecord(emptyRecord); setSuccess("Maintenance record updated."); setEditingId(null); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update maintenance record"); }
    finally { setAdding(false); }
  }

  function editRecord(row: RecordRow) {
    setEditingId(row.id);
    setRecord({ serviceDate: row.serviceDate, category: row.category, description: row.description,
      mileage: row.mileage?.toString() ?? "", vendor: row.vendor ?? "", cost: row.cost ?? "",
      nextDueDate: row.nextDueDate ?? "", nextDueMileage: row.nextDueMileage?.toString() ?? "", notes: row.notes,
      invoiceNumber: row.invoiceNumber ?? "", workOrderNumber: row.workOrderNumber ?? "", subtotal: row.subtotal ?? "",
      tax: row.tax ?? "", amountPaid: row.amountPaid ?? "", balanceDue: row.balanceDue ?? "" });
    setError(""); setSuccess("");
    requestAnimationFrame(() => document.getElementById("maintenance-record-form")?.scrollIntoView({ behavior: "smooth" }));
  }

  return <div className="space-y-8">
    {(error || success) && <p role="status" className={`rounded-lg px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || success}</p>}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Vehicle details</h2>
      <form onSubmit={saveProfile} className="space-y-5">
        <fieldset disabled={!canEdit || saving} className="space-y-5 disabled:opacity-75">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="Year" type="number" min="1900" max="2100" value={profile.year ?? ""} onChange={e => setProfile({ ...profile, year: e.target.value ? Number(e.target.value) : null })} />
            <Input label="Make" value={profile.make} onChange={e => setProfile({ ...profile, make: e.target.value })} />
            <Input label="Model" value={profile.model} onChange={e => setProfile({ ...profile, model: e.target.value })} />
            <Input label="VIN (full or last 4)" maxLength={17} value={profile.vin} onChange={e => setProfile({ ...profile, vin: e.target.value.toUpperCase() })} />
            <Input label="License plate" value={profile.licensePlate} onChange={e => setProfile({ ...profile, licensePlate: e.target.value })} />
            <Input label="Current mileage" type="number" min="0" value={profile.mileage ?? ""} onChange={e => setProfile({ ...profile, mileage: e.target.value ? Number(e.target.value) : null })} />
            <label className="block text-sm font-medium text-gray-700">Status<select className={`${fieldClass} mt-1`} value={profile.status} onChange={e => setProfile({ ...profile, status: e.target.value })}><option value="ACTIVE">Active</option><option value="IN_SERVICE">In service</option><option value="OUT_OF_SERVICE">Out of service</option></select></label>
            <Input label="Registration expires" type="date" value={profile.registrationExpiry} onChange={e => setProfile({ ...profile, registrationExpiry: e.target.value })} />
            <Input label="Insurance expires" type="date" value={profile.insuranceExpiry} onChange={e => setProfile({ ...profile, insuranceExpiry: e.target.value })} />
            <Input label="Insurance carrier" value={profile.insuranceCarrier} onChange={e => setProfile({ ...profile, insuranceCarrier: e.target.value })} />
            <Input label="Insurance deductible ($)" type="number" min="0" step="0.01" value={profile.insuranceDeductible} onChange={e => setProfile({ ...profile, insuranceDeductible: e.target.value })} />
            <Input label="Insurance premium ($)" type="number" min="0" step="0.01" value={profile.insurancePremium} onChange={e => setProfile({ ...profile, insurancePremium: e.target.value })} />
            <Input label="Inspection expires" type="date" value={profile.inspectionExpiry} onChange={e => setProfile({ ...profile, inspectionExpiry: e.target.value })} />
          </div>
          <label className="block text-sm font-medium text-gray-700">Vehicle notes<textarea className={`${fieldClass} mt-1`} rows={3} value={profile.notes} onChange={e => setProfile({ ...profile, notes: e.target.value })} /></label>
        </fieldset>
        {canEdit && <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save vehicle details"}</Button>}
      </form>
    </section>

    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Maintenance history</h2>
      {records.length === 0 ? <p className="mt-3 text-sm text-gray-500">No maintenance records yet.</p> : <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-[1050px] w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>
            {columns.map(column => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-3 text-left font-semibold text-gray-700">
              <button type="button" onClick={() => sortBy(column.key)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-blue-700 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" aria-label={`Sort by ${column.label}`}>
                {column.label}<span aria-hidden="true" className="text-xs text-gray-500">{sort.key === column.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
              </button>
            </th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100 bg-white">{sortedRecords.map(row => <tr key={row.id} className="align-top hover:bg-blue-50/40">
            <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900"><time dateTime={row.serviceDate}>{dateLabel(row.serviceDate)}</time></td>
            <td className="min-w-64 max-w-sm px-3 py-3 text-gray-900">
              <span className="line-clamp-2">{row.description}</span>
              {(row.description.length > 55 || row.notes || row.workOrderNumber || row.subtotal || row.tax || row.amountPaid || row.balanceDue || row.nextDueMileage != null) && <details className="mt-1 text-xs text-gray-600"><summary className="cursor-pointer text-blue-700">More details</summary><div className="mt-1 space-y-1">
                {row.description.length > 55 && <p className="whitespace-pre-wrap text-sm text-gray-900">{row.description}</p>}
                {row.notes && <p>{row.notes}</p>}
                {row.workOrderNumber && <p>Work order: {row.workOrderNumber}</p>}
                {row.subtotal && <p>Subtotal: ${Number(row.subtotal).toFixed(2)}</p>}
                {row.tax && <p>Tax: ${Number(row.tax).toFixed(2)}</p>}
                {row.amountPaid && <p>Paid: ${Number(row.amountPaid).toFixed(2)}</p>}
                {row.balanceDue && <p>Balance: ${Number(row.balanceDue).toFixed(2)}</p>}
                {row.nextDueMileage != null && <p>Next due mileage: {row.nextDueMileage.toLocaleString()}</p>}
              </div></details>}
              {canEdit && <button type="button" onClick={() => editRecord(row)} className="mt-1 block text-xs font-medium text-blue-700 hover:underline">Edit record</button>}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-gray-700">{row.category}</td>
            <td className="min-w-36 px-3 py-3 text-gray-700">{row.vendor || "—"}</td>
            <td className="whitespace-nowrap px-3 py-3 text-gray-700">{row.mileage == null ? "—" : row.mileage.toLocaleString()}</td>
            <td className="whitespace-nowrap px-3 py-3 text-gray-700">{row.cost === null ? "—" : `$${Number(row.cost).toFixed(2)}`}</td>
            <td className="whitespace-nowrap px-3 py-3 text-gray-700">{dateLabel(row.nextDueDate)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-gray-700">{row.invoiceNumber || "—"}</td>
            <td className="px-3 py-3 text-center">{row.sourceFileName ? <a href={`/api/maintenance/vans/${number}/records/${row.id}/document`} target="_blank" rel="noopener noreferrer" aria-label={`View document: ${row.sourceFileName}`} title={`View ${row.sourceFileName}`} className="inline-flex rounded p-1 text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>
            </a> : <span className="text-gray-400">—</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    {canEdit && editingId && <section id="maintenance-record-form" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Edit maintenance record</h2>
      <form onSubmit={saveRecord} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Service date" type="date" required value={record.serviceDate} onChange={e => setRecord({ ...record, serviceDate: e.target.value })} />
          <label className="block text-sm font-medium text-gray-700">Category<select className={`${fieldClass} mt-1`} value={record.category} onChange={e => setRecord({ ...record, category: e.target.value })}><option>Routine service</option><option>Oil change</option><option>Tires</option><option>Brakes</option><option>Inspection</option><option>Repair</option><option>Other</option></select></label>
          <Input label="Mileage at service" type="number" min="0" value={record.mileage} onChange={e => setRecord({ ...record, mileage: e.target.value })} />
          <Input label="Vendor" value={record.vendor} onChange={e => setRecord({ ...record, vendor: e.target.value })} />
          <Input label="Cost ($)" type="number" min="0" step="0.01" value={record.cost} onChange={e => setRecord({ ...record, cost: e.target.value })} />
          <Input label="Next due date" type="date" value={record.nextDueDate} onChange={e => setRecord({ ...record, nextDueDate: e.target.value })} />
          <Input label="Next due mileage" type="number" min="0" value={record.nextDueMileage} onChange={e => setRecord({ ...record, nextDueMileage: e.target.value })} />
          <Input label="Invoice number" value={record.invoiceNumber} onChange={e => setRecord({ ...record, invoiceNumber: e.target.value })} />
          <Input label="Work order number" value={record.workOrderNumber} onChange={e => setRecord({ ...record, workOrderNumber: e.target.value })} />
          <Input label="Subtotal ($)" type="number" min="0" step="0.01" value={record.subtotal} onChange={e => setRecord({ ...record, subtotal: e.target.value })} />
          <Input label="Tax ($)" type="number" min="0" step="0.01" value={record.tax} onChange={e => setRecord({ ...record, tax: e.target.value })} />
          <Input label="Amount paid ($)" type="number" min="0" step="0.01" value={record.amountPaid} onChange={e => setRecord({ ...record, amountPaid: e.target.value })} />
          <Input label="Balance due ($)" type="number" min="0" step="0.01" value={record.balanceDue} onChange={e => setRecord({ ...record, balanceDue: e.target.value })} />
        </div>
        <label className="block text-sm font-medium text-gray-700">Work performed<textarea className={`${fieldClass} mt-1`} required rows={3} value={record.description} onChange={e => setRecord({ ...record, description: e.target.value })} /></label>
        <label className="block text-sm font-medium text-gray-700">Notes<textarea className={`${fieldClass} mt-1`} rows={2} value={record.notes} onChange={e => setRecord({ ...record, notes: e.target.value })} /></label>
        <div className="flex gap-3"><Button type="submit" disabled={adding}>{adding ? "Saving…" : "Save record"}</Button><Button type="button" variant="secondary" onClick={() => { setEditingId(null); setRecord(emptyRecord); }}>Cancel edit</Button></div>
      </form>
    </section>}
  </div>;
}
