"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

type EsignStatus = "SENT" | "SIGNED" | "CANCELLED";

interface SignableDocument {
  id: string;
  name: string;
  description: string;
}

interface EsignRequest {
  id: string;
  status: EsignStatus;
  sentAt: string;
  signedAt: string | null;
  cancelledAt: string | null;
  signedFileDriveId: string | null;
  signableDocument: { id: string; name: string };
  requestedBy: { id: string; name: string };
}

function driveFileUrl(fileId: string | null): string | null {
  if (!fileId || fileId.startsWith("stub-")) return null;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

interface Props {
  employeeId: string;
  employeeHasEmail: boolean;
  employeeHasDriveFolder: boolean;
  isTerminated?: boolean;
  signableDocuments: SignableDocument[];
  initialRequests: EsignRequest[];
}

export function EsignRequestsCard({
  employeeId,
  employeeHasEmail,
  employeeHasDriveFolder,
  isTerminated = false,
  signableDocuments,
  initialRequests,
}: Props) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [selectedDocId, setSelectedDocId] = useState<string>(
    signableDocuments[0]?.id ?? ""
  );
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const canSend =
    !isTerminated &&
    employeeHasEmail &&
    employeeHasDriveFolder &&
    signableDocuments.length > 0 &&
    !!selectedDocId;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/employees/${employeeId}/esign-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signableDocumentId: selectedDocId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setRequests([data, ...requests]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function transition(requestId: string, action: "mark_signed" | "cancel") {
    setBusyId(requestId);
    setError("");
    try {
      const res = await fetch(`/api/esign-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setRequests(requests.map((r) => (r.id === requestId ? data : r)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900">eSignature Requests</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {isTerminated && (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            This employee is no longer active — new eSign requests are disabled.
            History is preserved below.
          </p>
        )}
        {!isTerminated && !employeeHasEmail && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Add a real email address to this employee before preparing eSign requests.
          </p>
        )}
        {!isTerminated && employeeHasEmail && !employeeHasDriveFolder && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This employee has no Drive folder yet — eSign requests are disabled.
          </p>
        )}
        {!isTerminated && signableDocuments.length === 0 && (
          <p className="text-sm text-gray-500">
            No signable documents configured yet. A super admin can register one
            via the Signable Documents API.
          </p>
        )}

        {!isTerminated && signableDocuments.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 uppercase tracking-wide">
                  Prepare for signature
                </label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  disabled={!canSend || sending}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  {signableDocuments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={send} disabled={!canSend || sending}>
                {sending ? "Preparing…" : "Prepare Document"}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Copies the document into the employee&apos;s Drive folder. Open the
              link below and use Drive&apos;s &ldquo;Request signature&rdquo; to
              send it, then come back and click &ldquo;Mark signed&rdquo; once
              they sign.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <ul className="divide-y divide-gray-100">
          {requests.length === 0 && (
            <li className="text-sm text-gray-400 py-3">No requests yet.</li>
          )}
          {requests.map((r) => {
            const fileUrl = driveFileUrl(r.signedFileDriveId);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between py-3 gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {r.signableDocument.name}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Prepared by {r.requestedBy.name} on {formatDateTime(r.sentAt)}
                    {r.status === "SIGNED" && r.signedAt && (
                      <> · Signed {formatDateTime(r.signedAt)}</>
                    )}
                    {r.status === "CANCELLED" && r.cancelledAt && (
                      <> · Cancelled {formatDateTime(r.cancelledAt)}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {fileUrl && (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Open in Drive
                    </a>
                  )}
                  {r.status === "SENT" && !isTerminated && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => transition(r.id, "mark_signed")}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id ? "Saving…" : "Mark signed"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => transition(r.id, "cancel")}
                        disabled={busyId === r.id}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: EsignStatus }) {
  if (status === "SIGNED") return <Badge variant="success">Signed</Badge>;
  if (status === "CANCELLED") return <Badge variant="default">Cancelled</Badge>;
  return <Badge variant="warning">Sent</Badge>;
}
