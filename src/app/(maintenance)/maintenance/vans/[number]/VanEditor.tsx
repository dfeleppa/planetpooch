"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Van = {
  year: number | null; make: string; model: string; vin: string; licensePlate: string;
  mileage: number | null; status: string; registrationExpiry: string; insuranceExpiry: string;
  inspectionExpiry: string; notes: string;
};
type RecordRow = {
  id: string; serviceDate: string; category: string; description: string; mileage: number | null;
  vendor: string | null; cost: string | null; nextDueDate: string | null;
  nextDueMileage: number | null; notes: string;
};

const fieldClass = "block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const dateLabel = (value: string | null) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—";

export function VanEditor({ number, van, records, canEdit }: { number: number; van: Van; records: RecordRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState(van);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [record, setRecord] = useState({ serviceDate: "", category: "Routine service", description: "", mileage: "", vendor: "", cost: "", nextDueDate: "", nextDueMileage: "", notes: "" });

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

  async function addRecord(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSuccess(""); setAdding(true);
    try {
      const response = await fetch(editingId ? `/api/maintenance/vans/${number}/records/${editingId}` : `/api/maintenance/vans/${number}/records`, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add maintenance record");
      setRecord({ serviceDate: "", category: "Routine service", description: "", mileage: "", vendor: "", cost: "", nextDueDate: "", nextDueMileage: "", notes: "" });
      setSuccess(editingId ? "Maintenance record updated." : "Maintenance record added."); setEditingId(null); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add maintenance record"); }
    finally { setAdding(false); }
  }

  function editRecord(row: RecordRow) {
    setEditingId(row.id);
    setRecord({ serviceDate: row.serviceDate, category: row.category, description: row.description,
      mileage: row.mileage?.toString() ?? "", vendor: row.vendor ?? "", cost: row.cost ?? "",
      nextDueDate: row.nextDueDate ?? "", nextDueMileage: row.nextDueMileage?.toString() ?? "", notes: row.notes });
    setError(""); setSuccess("");
    document.getElementById("maintenance-record-form")?.scrollIntoView({ behavior: "smooth" });
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
            <Input label="VIN" maxLength={17} value={profile.vin} onChange={e => setProfile({ ...profile, vin: e.target.value.toUpperCase() })} />
            <Input label="License plate" value={profile.licensePlate} onChange={e => setProfile({ ...profile, licensePlate: e.target.value })} />
            <Input label="Current mileage" type="number" min="0" value={profile.mileage ?? ""} onChange={e => setProfile({ ...profile, mileage: e.target.value ? Number(e.target.value) : null })} />
            <label className="block text-sm font-medium text-gray-700">Status<select className={`${fieldClass} mt-1`} value={profile.status} onChange={e => setProfile({ ...profile, status: e.target.value })}><option value="ACTIVE">Active</option><option value="IN_SERVICE">In service</option><option value="OUT_OF_SERVICE">Out of service</option></select></label>
            <Input label="Registration expires" type="date" value={profile.registrationExpiry} onChange={e => setProfile({ ...profile, registrationExpiry: e.target.value })} />
            <Input label="Insurance expires" type="date" value={profile.insuranceExpiry} onChange={e => setProfile({ ...profile, insuranceExpiry: e.target.value })} />
            <Input label="Inspection expires" type="date" value={profile.inspectionExpiry} onChange={e => setProfile({ ...profile, inspectionExpiry: e.target.value })} />
          </div>
          <label className="block text-sm font-medium text-gray-700">Vehicle notes<textarea className={`${fieldClass} mt-1`} rows={3} value={profile.notes} onChange={e => setProfile({ ...profile, notes: e.target.value })} /></label>
        </fieldset>
        {canEdit && <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save vehicle details"}</Button>}
      </form>
    </section>

    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Maintenance history</h2>
      {records.length === 0 ? <p className="mt-3 text-sm text-gray-500">No maintenance records yet.</p> : <div className="mt-4 space-y-3">{records.map(row => <article key={row.id} className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-gray-900">{row.category}</h3><p className="text-sm text-gray-700">{row.description}</p></div><div className="flex items-center gap-3"><time className="text-sm text-gray-500">{dateLabel(row.serviceDate)}</time>{canEdit && <button type="button" onClick={() => editRecord(row)} className="text-sm font-medium text-blue-600 hover:underline">Edit</button>}</div></div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          {row.mileage != null && <div><dt className="inline font-medium">Mileage: </dt><dd className="inline">{row.mileage.toLocaleString()}</dd></div>}
          {row.vendor && <div><dt className="inline font-medium">Vendor: </dt><dd className="inline">{row.vendor}</dd></div>}
          {row.cost && <div><dt className="inline font-medium">Cost: </dt><dd className="inline">${Number(row.cost).toFixed(2)}</dd></div>}
          {row.nextDueDate && <div><dt className="inline font-medium">Next due: </dt><dd className="inline">{dateLabel(row.nextDueDate)}</dd></div>}
          {row.nextDueMileage != null && <div><dt className="inline font-medium">Next due mileage: </dt><dd className="inline">{row.nextDueMileage.toLocaleString()}</dd></div>}
        </dl>{row.notes && <p className="mt-2 text-sm text-gray-600">{row.notes}</p>}
      </article>)}</div>}
    </section>

    {canEdit && <section id="maintenance-record-form" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{editingId ? "Edit maintenance record" : "Add maintenance record"}</h2>
      <form onSubmit={addRecord} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Service date" type="date" required value={record.serviceDate} onChange={e => setRecord({ ...record, serviceDate: e.target.value })} />
          <label className="block text-sm font-medium text-gray-700">Category<select className={`${fieldClass} mt-1`} value={record.category} onChange={e => setRecord({ ...record, category: e.target.value })}><option>Routine service</option><option>Oil change</option><option>Tires</option><option>Brakes</option><option>Inspection</option><option>Repair</option><option>Other</option></select></label>
          <Input label="Mileage at service" type="number" min="0" value={record.mileage} onChange={e => setRecord({ ...record, mileage: e.target.value })} />
          <Input label="Vendor" value={record.vendor} onChange={e => setRecord({ ...record, vendor: e.target.value })} />
          <Input label="Cost ($)" type="number" min="0" step="0.01" value={record.cost} onChange={e => setRecord({ ...record, cost: e.target.value })} />
          <Input label="Next due date" type="date" value={record.nextDueDate} onChange={e => setRecord({ ...record, nextDueDate: e.target.value })} />
          <Input label="Next due mileage" type="number" min="0" value={record.nextDueMileage} onChange={e => setRecord({ ...record, nextDueMileage: e.target.value })} />
        </div>
        <label className="block text-sm font-medium text-gray-700">Work performed<textarea className={`${fieldClass} mt-1`} required rows={3} value={record.description} onChange={e => setRecord({ ...record, description: e.target.value })} /></label>
        <label className="block text-sm font-medium text-gray-700">Notes<textarea className={`${fieldClass} mt-1`} rows={2} value={record.notes} onChange={e => setRecord({ ...record, notes: e.target.value })} /></label>
        <div className="flex gap-3"><Button type="submit" disabled={adding}>{adding ? "Saving…" : editingId ? "Save record" : "Add maintenance record"}</Button>{editingId && <Button type="button" variant="secondary" onClick={() => { setEditingId(null); setRecord({ serviceDate: "", category: "Routine service", description: "", mileage: "", vendor: "", cost: "", nextDueDate: "", nextDueMileage: "", notes: "" }); }}>Cancel edit</Button>}</div>
      </form>
    </section>}
  </div>;
}
