"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { combineVanImagePages, prepareVanDocumentImage } from "@/lib/van-document-pages";

type VehicleDocument = { id: string; category: string; title: string; issueDate: string | null; expiryDate: string | null; notes: string; fileName: string };
const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" });
const vehicleCategories = ["Title", "Registration", "Inspection", "Insurance", "Other"];

export function VehicleDocuments({ number, canEdit, documents }: { number: number; canEdit: boolean; documents: VehicleDocument[] }) {
  const vehicleDocuments = documents.filter(document => document.category !== "Maintenance").sort((a, b) => {
    const aOrder = vehicleCategories.indexOf(a.category);
    const bOrder = vehicleCategories.indexOf(b.category);
    return (aOrder < 0 ? vehicleCategories.length : aOrder) - (bOrder < 0 ? vehicleCategories.length : bOrder);
  });
  return <DocumentSection number={number} canEdit={canEdit} documents={vehicleDocuments} maintenance={false} />;
}

export function MaintenanceDocuments({ number, canEdit, documents }: { number: number; canEdit: boolean; documents: VehicleDocument[] }) {
  return <DocumentSection number={number} canEdit={canEdit} documents={documents.filter(document => document.category === "Maintenance")} maintenance />;
}

function DocumentSection({ number, canEdit, documents, maintenance }: { number: number; canEdit: boolean; documents: VehicleDocument[]; maintenance: boolean }) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState(maintenance ? "Maintenance" : "Title");
  const [busy, setBusy] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setError(""); setSuccess("");
    setBusy(true); setUploadingName(files.length === 1 ? files[0].name : `${files.length} pages`);
    try {
      if (files.length > 6 || (files.length > 1 && files.some(file => file.type === "application/pdf")))
        throw new Error("Choose one PDF or up to six image pages.");
      const prepared = await Promise.all(files.map(prepareVanDocumentImage));
      const ready = prepared.length === 1 ? prepared[0]
        : await combineVanImagePages(prepared, `Van-${number}-${category}.pdf`);
      if (!ready.size || ready.size > 4_000_000) throw new Error("Choose a file under 4 MB.");
      const body = new FormData();
      body.set("category", category);
      body.set("document", ready);
      const response = await fetch(`/api/maintenance/vans/${number}/documents`, { method: "POST", body });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not save document.");
      setSuccess(category === "Maintenance" && !result.recordCreated
        ? `${result.title} saved as a document. A maintenance history row needs a readable service date and work performed.`
        : `${result.recordCreated ? "Maintenance record" : result.title} saved${result.profileUpdated ? " and vehicle details updated" : ""}.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save document."); }
    finally { setBusy(false); setUploadingName(""); }
  }

  async function remove(document: VehicleDocument) {
    if (!window.confirm(`Delete ${document.title}? This removes the stored file.`)) return;
    setError(""); setSuccess(""); setBusy(true);
    try {
      const response = await fetch(`/api/maintenance/vans/${number}/documents/${document.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete document.");
      setSuccess("Vehicle document deleted."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete document."); }
    finally { setBusy(false); }
  }

  return <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-gray-900">{maintenance ? "Maintenance documents" : "Vehicle documents"}</h2>
    <p className="mt-1 text-sm text-gray-600">{maintenance ? "Service paperwork that was saved without a maintenance history row." : "Keep titles, registrations, inspections, insurance, and other vehicle records here."}</p>
    {(error || success) && <p role="status" className={`mt-4 rounded-lg px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || success}</p>}
    {canEdit && <div className="mt-5 space-y-4 border-b border-gray-200 pb-5">
      <h3 className="font-semibold text-gray-900">Add {maintenance ? "maintenance" : "vehicle"} document</h3>
      {!maintenance && <label className="block max-w-sm text-sm font-medium text-gray-700">Document type
        <select className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={category} disabled={busy} onChange={event => setCategory(event.target.value)}>
          {vehicleCategories.map(option => <option key={option}>{option}</option>)}
        </select>
      </label>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => cameraInput.current?.click()}>Camera</Button>
        <Button type="button" disabled={busy} onClick={() => uploadInput.current?.click()}>Upload</Button>
      </div>
      <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1}
        onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} />
      <input ref={uploadInput} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" className="sr-only" tabIndex={-1}
        onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} />
      <p className="text-xs text-gray-500">One PDF or up to six image pages. The document is read and saved after you choose a file.</p>
      {busy && <p role="status" className="text-sm text-blue-700">Reading and saving {uploadingName}…</p>}
    </div>}
    {documents.length === 0 ? <p className="mt-4 text-sm text-gray-500">No {maintenance ? "maintenance" : "vehicle"} documents yet.</p> :
      <div className="mt-4 space-y-3">{documents.map(document => <article key={document.id} className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{document.category}</p><h3 className="font-semibold text-gray-900">{document.title}</h3></div>
          {canEdit && <button type="button" disabled={busy} onClick={() => void remove(document)} className="text-sm text-red-700 hover:underline disabled:opacity-50">Delete</button>}</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          {document.issueDate && <span>Issued {dateLabel(document.issueDate)}</span>}
          {document.expiryDate && <span>Expires {dateLabel(document.expiryDate)}</span>}
        </div>
        {document.notes && <p className="mt-2 text-sm text-gray-600">{document.notes}</p>}
        <a href={`/api/maintenance/vans/${number}/documents/${document.id}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">View file: {document.fileName}</a>
      </article>)}</div>}
  </section>;
}
