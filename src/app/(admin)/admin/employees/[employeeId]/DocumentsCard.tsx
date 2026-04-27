"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/employee-documents";
import type { EmployeeDocumentCategory } from "@prisma/client";

interface DocumentRow {
  id: string;
  category: EmployeeDocumentCategory;
  customName: string | null;
  fileName: string;
  driveFileId: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: { id: string; name: string } | null;
}

interface Props {
  employeeId: string;
  hasDriveFolder: boolean;
  isTerminated?: boolean;
  initialDocuments: DocumentRow[];
}

const CATEGORY_OPTIONS: { value: EmployeeDocumentCategory; label: string }[] = [
  { value: "I9", label: DOCUMENT_CATEGORY_LABELS.I9 },
  { value: "ID_CARD", label: DOCUMENT_CATEGORY_LABELS.ID_CARD },
  { value: "SS_CARD", label: DOCUMENT_CATEGORY_LABELS.SS_CARD },
  { value: "OTHER", label: DOCUMENT_CATEGORY_LABELS.OTHER },
];

export function DocumentsCard({
  employeeId,
  hasDriveFolder,
  isTerminated = false,
  initialDocuments,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [category, setCategory] = useState<EmployeeDocumentCategory>("I9");
  const [customName, setCustomName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const isOther = category === "OTHER";
  const canSubmit =
    !isTerminated &&
    hasDriveFolder &&
    !!file &&
    (!isOther || customName.trim().length > 0) &&
    !uploading;

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      if (isOther) fd.append("customName", customName.trim());

      const res = await fetch(`/api/employees/${employeeId}/documents`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setDocuments([data, ...documents]);
      setFile(null);
      setCustomName("");
      setCategory("I9");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900">Documents</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {isTerminated && (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            This employee is no longer active — new uploads are disabled.
            History is preserved below.
          </p>
        )}
        {!isTerminated && !hasDriveFolder && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Create a Drive folder for this employee before uploading documents.
          </p>
        )}

        {!isTerminated && (
        <form onSubmit={upload} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EmployeeDocumentCategory)}
                disabled={!hasDriveFolder || uploading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {isOther && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  Document name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  disabled={!hasDriveFolder || uploading}
                  placeholder="e.g. Background Check"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!hasDriveFolder || uploading}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-50"
            />
            {file && (
              <p className="text-xs text-gray-500">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
            <p className="text-xs text-gray-400">
              PDF or image, up to 10 MB.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
        )}

        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {documents.length === 0 && (
            <li className="text-sm text-gray-400 py-3">No documents yet.</li>
          )}
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {doc.category === "OTHER"
                      ? doc.customName || "Document"
                      : DOCUMENT_CATEGORY_LABELS[doc.category]}
                  </span>
                  <Badge variant={doc.category === "OTHER" ? "default" : "info"}>
                    {DOCUMENT_CATEGORY_LABELS[doc.category]}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {doc.fileName} · {formatBytes(doc.fileSize)} · uploaded by{" "}
                  {doc.uploadedBy?.name ?? "(removed)"} on {formatDateTime(doc.uploadedAt)}
                </div>
              </div>
              <a
                href={`https://drive.google.com/file/d/${doc.driveFileId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline shrink-0"
              >
                Open ↗
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
