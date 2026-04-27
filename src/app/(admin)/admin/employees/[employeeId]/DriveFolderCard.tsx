"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  employeeId: string;
  driveFolderId: string | null;
  webViewLink: string | null;
  driveEnabled: boolean;
  isStub: boolean;
}

export function DriveFolderCard({
  employeeId,
  driveFolderId,
  webViewLink,
  driveEnabled,
  isStub,
}: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createFolder() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/employees/${employeeId}/drive-folder`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create folder");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900">Drive Folder</h2>
          <StatusBadge
            driveEnabled={driveEnabled}
            hasFolder={!!driveFolderId}
            isStub={isStub}
          />
        </div>
      </CardHeader>
      <CardContent>
        {!driveEnabled && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Google Drive integration is disabled — the WIF environment
            variables are missing. Folders cannot be created until that's
            fixed in the Vercel project settings.
          </p>
        )}

        {driveEnabled && isStub && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            This employee has a placeholder folder ID from a time when Drive
            was disabled. The folder doesn't actually exist in Google Drive.
            Use the button below to create a real one — the placeholder will
            be replaced.
          </p>
        )}

        {driveFolderId && !isStub && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              This employee has a Drive folder for signed documents and uploads.
            </p>
            {webViewLink ? (
              <a
                href={webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline shrink-0"
              >
                Open in Google Drive ↗
              </a>
            ) : (
              <span className="text-xs text-amber-700 shrink-0">
                Link unavailable — open Drive manually
              </span>
            )}
          </div>
        )}

        {(!driveFolderId || isStub) && (
          <div className="flex items-center justify-between gap-3 mt-3">
            <p className="text-sm text-amber-700">
              {driveFolderId
                ? "Replace the placeholder with a real folder."
                : "No Drive folder yet. Create one to enable file uploads and eSignature requests."}
            </p>
            <Button
              onClick={createFolder}
              disabled={creating || !driveEnabled}
              title={
                !driveEnabled
                  ? "Drive integration is disabled — fix WIF env vars first"
                  : undefined
              }
            >
              {creating
                ? "Creating…"
                : driveFolderId
                ? "Recreate folder"
                : "Create Drive folder"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  driveEnabled,
  hasFolder,
  isStub,
}: {
  driveEnabled: boolean;
  hasFolder: boolean;
  isStub: boolean;
}) {
  if (!driveEnabled) return <Badge variant="danger">Drive disabled</Badge>;
  if (isStub) return <Badge variant="danger">Placeholder folder</Badge>;
  if (!hasFolder) return <Badge variant="warning">Missing</Badge>;
  return <Badge variant="success">Connected</Badge>;
}
