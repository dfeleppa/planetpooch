"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseVanInvoice } from "@/lib/van-invoice-parser";
import { combineVanImagePages } from "@/lib/van-document-pages";

type Van = {
  year: number | null; make: string; model: string; vin: string; licensePlate: string;
  mileage: number | null; status: string; registrationExpiry: string; insuranceExpiry: string;
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
type DocumentPage = { file: File; text: string };
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
  const [documentPages, setDocumentPages] = useState<DocumentPage[]>([]);
  const [reading, setReading] = useState(false);
  const [readProgress, setReadProgress] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
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

  async function selectDocuments(files: File[]) {
    setDocumentPages(files.map(file => ({ file, text: "" }))); setError(""); setReadProgress("");
    if (!files.length) return;
    if (files.length > 6) { setDocumentPages([]); setError("Choose up to six pages per record."); return; }
    if (files.some(file => file.size > 4_000_000 || !file.size)) { setDocumentPages([]); setError("Each page must be under 4 MB."); return; }
    if (files.some(file => !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type))) { setDocumentPages([]); setError("Choose JPG, PNG, WebP, or PDF files."); return; }
    if (files.some(file => file.type === "application/pdf")) {
      if (files.length > 1) { setDocumentPages([]); setError("Choose one PDF, or choose multiple image pages."); return; }
      setReadProgress("PDF attached. Enter its details before saving; automatic reading is available for images."); return;
    }
    setReading(true);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr",
        logger: event => { if (event.status === "recognizing text") setReadProgress(`Reading pages… ${Math.round(event.progress * 100)}%`); },
      });
      try {
        const pageTexts: string[] = [];
        for (const [index, file] of files.entries()) {
          setReadProgress(`Reading page ${index + 1} of ${files.length}…`);
          const result = await worker.recognize(file);
          pageTexts.push(result.data.text);
          setDocumentPages(current => current.map((page, position) => position === index ? { ...page, text: result.data.text } : page));
        }
        const extracted = parseVanInvoice(pageTexts.join("\n\n"));
        setRecord(current => ({ ...current, ...extracted }));
        setReadProgress("Text extracted. Check every field against the document before saving.");
      } finally { await worker.terminate(); }
    } catch (cause) { setError(cause instanceof Error ? `Could not read pages: ${cause.message}` : "Could not read pages."); }
    finally { setReading(false); }
  }

  function moveDocumentPage(index: number, direction: -1 | 1) {
    setDocumentPages(current => {
      const next = [...current];
      const other = index + direction;
      if (other < 0 || other >= next.length) return current;
      [next[index], next[other]] = [next[other], next[index]];
      return next;
    });
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

  async function addRecord(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSuccess(""); setAdding(true);
    try {
      if (editingId && documentPages.length) throw new Error("Document upload is available when adding a record. Save this edit, then add a new record for the document.");
      const upload = documentPages.length > 1
        ? await combineVanImagePages(documentPages.map(page => page.file), `Van-${number}-${record.serviceDate || "maintenance"}.pdf`)
        : documentPages[0]?.file;
      const body = upload ? new FormData() : JSON.stringify(record);
      if (body instanceof FormData) { body.set("record", JSON.stringify(record)); body.set("document", upload!); }
      const response = await fetch(editingId ? `/api/maintenance/vans/${number}/records/${editingId}` : `/api/maintenance/vans/${number}/records`, { method: editingId ? "PATCH" : "POST", ...(body instanceof FormData ? {} : { headers: { "Content-Type": "application/json" } }), body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add maintenance record");
      setRecord(emptyRecord); setDocumentPages([]); setReadProgress(""); setFileInputKey(key => key + 1);
      setSuccess(editingId ? "Maintenance record updated." : "Maintenance record added."); setEditingId(null); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add maintenance record"); }
    finally { setAdding(false); }
  }

  function editRecord(row: RecordRow) {
    setEditingId(row.id);
    setRecord({ serviceDate: row.serviceDate, category: row.category, description: row.description,
      mileage: row.mileage?.toString() ?? "", vendor: row.vendor ?? "", cost: row.cost ?? "",
      nextDueDate: row.nextDueDate ?? "", nextDueMileage: row.nextDueMileage?.toString() ?? "", notes: row.notes,
      invoiceNumber: row.invoiceNumber ?? "", workOrderNumber: row.workOrderNumber ?? "", subtotal: row.subtotal ?? "",
      tax: row.tax ?? "", amountPaid: row.amountPaid ?? "", balanceDue: row.balanceDue ?? "" });
    setDocumentPages([]); setReadProgress("");
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

    {canEdit && <section id="maintenance-record-form" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{editingId ? "Edit maintenance record" : "Add maintenance record"}</h2>
      <form onSubmit={addRecord} className="space-y-4">
        {!editingId && <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <label className="block text-sm font-medium text-gray-800">Choose maintenance files or existing photos (one PDF or up to six image pages; each file under 4 MB)<input key={`files-${fileInputKey}`} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full text-sm" onChange={event => void selectDocuments(Array.from(event.target.files ?? []))} /></label>
          <label className="mt-3 block text-sm font-medium text-gray-800">Take a photo with your phone<input key={`camera-${fileInputKey}`} type="file" accept="image/*" capture="environment" className="mt-2 block w-full text-sm" onChange={event => void selectDocuments(Array.from(event.target.files ?? []))} /></label>
          {documentPages.length > 0 && <ol className="mt-2 space-y-1 text-sm text-gray-700">{documentPages.map((page, index) => <li key={`${page.file.name}-${index}`} className="flex items-center gap-2"><span>Page {index + 1}: {page.file.name}</span>{documentPages.length > 1 && <><button type="button" disabled={reading || index === 0} onClick={() => moveDocumentPage(index, -1)} className="text-blue-700 disabled:text-gray-400">Move up</button><button type="button" disabled={reading || index === documentPages.length - 1} onClick={() => moveDocumentPage(index, 1)} className="text-blue-700 disabled:text-gray-400">Move down</button></>}</li>)}</ol>}
          {documentPages.length > 1 && <p className="mt-2 text-xs text-gray-600">The pages will be saved together as one PDF in this order.</p>}
          {(reading || readProgress) && <p role="status" className="mt-2 text-sm text-gray-700">{reading && !readProgress ? "Reading pages…" : readProgress}</p>}
          {documentPages.some(page => page.text) && <details className="mt-2 text-sm"><summary className="cursor-pointer text-blue-700">Show extracted text</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs">{documentPages.map((page, index) => `Page ${index + 1}: ${page.file.name}\n${page.text}`).join("\n\n")}</pre></details>}
        </div>}
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
        <div className="flex gap-3"><Button type="submit" disabled={adding || reading}>{adding ? "Saving…" : editingId ? "Save record" : "Add maintenance record"}</Button>{editingId && <Button type="button" variant="secondary" onClick={() => { setEditingId(null); setRecord(emptyRecord); }}>Cancel edit</Button>}</div>
      </form>
    </section>}
  </div>;
}
