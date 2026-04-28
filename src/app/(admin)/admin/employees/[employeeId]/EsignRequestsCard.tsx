"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

type EsignStatus = "SENT" | "SIGNED" | "CANCELLED";
type TransitionAction = "mark_signed" | "cancel" | "check_signature";

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
  const [driveFileRef, setDriveFileRef] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<TransitionAction | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const canSend =
    !isTerminated &&
    employeeHasEmail &&
    signableDocuments.length > 0 &&
    !!selectedDocId &&
    driveFileRef.trim().length > 0;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/employees/${employeeId}/esign-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signableDocumentId: selectedDocId,
          driveFileRef: driveFileRef.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register");
      setRequests([data, ...requests]);
      setDriveFileRef("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setSending(false);
    }
  }

  async function transition(requestId: string, action: TransitionAction) {
    setBusyId(requestId);
    setBusyAction(action);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/esign-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");

      const updated: EsignRequest =
        action === "check_signature" ? data.request : data;
      setRequests(requests.map((r) => (r.id === requestId ? updated : r)));

      if (action === "check_signature") {
        setInfo(
          data.signatureDetected
            ? "Signature confirmed in Drive — request marked signed."
            : "Not signed in Drive yet. Try again once the employee signs."
        );
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusyId(null);
      setBusyAction(null);
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
            Heads up: this employee has no Drive folder yet. You can still
            register eSign requests, but the file must already exist somewhere
            the service account can read.
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
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">
                  Document type
                </label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  disabled={sending}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  {signableDocuments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">
                  Drive file URL or ID
                </label>
                <input
                  type="text"
                  value={driveFileRef}
                  onChange={(e) => setDriveFileRef(e.target.value)}
                  disabled={sending}
                  placeholder="https://drive.google.com/file/d/…"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <Button onClick={send} disabled={!canSend || sending}>
                {sending ? "Registering…" : "Register eSign request"}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Create the document in Drive and start the signature request
              there, then paste the file&apos;s share URL or ID here. Use
              &ldquo;Check signature&rdquo; once they sign — or
              &ldquo;Mark signed&rdquo; as a manual override.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {info && (
          <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            {info}
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
                        variant="secondary"
                        onClick={() => transition(r.id, "check_signature")}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id && busyAction === "check_signature"
                          ? "Checking…"
                          : "Check signature"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => transition(r.id, "mark_signed")}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id && busyAction === "mark_signed"
                          ? "Saving…"
                          : "Mark signed"}
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
