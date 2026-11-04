"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiResponse } from "@/lib/api-response";
import { combineVanImagePages, prepareVanDocumentImage } from "@/lib/van-document-pages";

const vehicleCategories = ["Title", "Registration", "Inspection", "Insurance", "Other"];

export function VanDocumentUpload({ number }: { number: number }) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("Maintenance");
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
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result?.error || "Could not save document.");
      setSuccess(category === "Maintenance" && !result.recordCreated
        ? `${result.title} saved as a document. A maintenance history row needs a readable service date and work performed.`
        : `${result.recordCreated ? "Maintenance record" : result.title} saved${result.profileUpdated ? " and vehicle details updated" : ""}.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save document."); }
    finally { setBusy(false); setUploadingName(""); }
  }

  return <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="upload-document-heading">
    <h2 id="upload-document-heading" className="text-lg font-semibold text-gray-900">Upload a document</h2>
    <p className="mt-1 text-sm text-gray-600">Add vehicle paperwork or a maintenance invoice. Details are read and saved to the right section.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block w-full text-sm font-medium text-gray-700 sm:w-64">Document type
        <select className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={category} disabled={busy} onChange={event => setCategory(event.target.value)}>
          <option value="Maintenance">Maintenance / service invoice</option>
          {vehicleCategories.map(option => <option key={option}>{option}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => cameraInput.current?.click()}>Camera</Button>
        <Button type="button" disabled={busy} onClick={() => uploadInput.current?.click()}>Upload file</Button>
      </div>
      <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1}
        onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} />
      <input ref={uploadInput} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" className="sr-only" tabIndex={-1}
        onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} />
      <p className="w-full text-xs text-gray-500">One PDF or up to six image pages. The document is read and saved after you choose a file.</p>
      {busy && <p role="status" className="w-full text-sm text-blue-700">Reading and saving {uploadingName}…</p>}
    </div>
    {(error || success) && <p role="status" className={`mt-4 rounded-lg px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || success}</p>}
  </section>;
}
