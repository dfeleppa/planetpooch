"use client";

import { readApiResponse } from "@/lib/api-response";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function remove(document: VehicleDocument) {
    if (!window.confirm(`Delete ${document.title}? This removes the stored file.`)) return;
    setError(""); setSuccess(""); setBusy(true);
    try {
      const response = await fetch(`/api/maintenance/vans/${number}/documents/${document.id}`, { method: "DELETE" });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || "Could not delete document.");
      setSuccess("Vehicle document deleted."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete document."); }
    finally { setBusy(false); }
  }

  return <details className="group mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">{maintenance ? "Maintenance documents" : "Vehicle documents"} <span className="ml-2 text-sm font-normal text-gray-500">({documents.length})</span></h2>
        <p className="mt-1 text-sm text-gray-600">{maintenance ? "Service paperwork saved without a maintenance history row." : "Titles, registrations, inspections, insurance, and other vehicle records."}</p>
      </div>
      <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <div className="border-t border-gray-100 px-5 pb-5">
      {(error || success) && <p role="status" className={`mt-4 rounded-lg px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || success}</p>}
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
    </div>
  </details>;
}
