"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type VehicleDocument = { id: string; category: string; title: string; issueDate: string | null; expiryDate: string | null; notes: string; fileName: string };
const initialDetails = { category: "Title", title: "", issueDate: "", expiryDate: "", notes: "" };
const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" });

export function VehicleDocuments({ number, canEdit, documents }: { number: number; canEdit: boolean; documents: VehicleDocument[] }) {
  const router = useRouter();
  const [details, setDetails] = useState(initialDetails);
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!file) { setError("Choose a document to upload."); return; }
    if (!file.size || file.size > 4_000_000) { setError("Choose a file under 4 MB."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("details", JSON.stringify(details));
      body.set("document", file);
      const response = await fetch(`/api/maintenance/vans/${number}/documents`, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save document.");
      setDetails(initialDetails); setFile(null); setInputKey(key => key + 1);
      setSuccess("Vehicle document saved."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save document."); }
    finally { setBusy(false); }
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
    <h2 className="text-lg font-semibold text-gray-900">Vehicle documents</h2>
    <p className="mt-1 text-sm text-gray-600">Keep titles, registrations, insurance, inspection paperwork, and other vehicle records here.</p>
    {(error || success) && <p role="status" className={`mt-4 rounded-lg px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || success}</p>}
    {documents.length === 0 ? <p className="mt-4 text-sm text-gray-500">No vehicle documents yet.</p> :
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
    {canEdit && <form onSubmit={save} className="mt-6 space-y-4 border-t border-gray-200 pt-5">
      <h3 className="font-semibold text-gray-900">Add vehicle document</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm font-medium text-gray-700">Type<select className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={details.category} onChange={event => setDetails({ ...details, category: event.target.value })}><option>Title</option><option>Registration</option><option>Insurance</option><option>Inspection</option><option>Other</option></select></label>
        <Input label="Document name" required maxLength={200} value={details.title} onChange={event => setDetails({ ...details, title: event.target.value })} />
        <Input label="Issue date" type="date" value={details.issueDate} onChange={event => setDetails({ ...details, issueDate: event.target.value })} />
        <Input label="Expiration date" type="date" value={details.expiryDate} onChange={event => setDetails({ ...details, expiryDate: event.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Choose a file or existing photo (JPG, PNG, WebP, or PDF; under 4 MB)<input key={`file-${inputKey}`} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full text-sm" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="block text-sm font-medium text-gray-700">Take a photo with your phone<input key={`camera-${inputKey}`} type="file" accept="image/*" capture="environment" className="mt-2 block w-full text-sm" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        {file && <p className="text-sm text-gray-600">Selected: {file.name}</p>}
      </div>
      <label className="block text-sm font-medium text-gray-700">Notes<textarea className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={2} maxLength={2000} value={details.notes} onChange={event => setDetails({ ...details, notes: event.target.value })} /></label>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save document"}</Button>
    </form>}
  </section>;
}
