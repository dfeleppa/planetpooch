"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  employeeId: string;
  driveFolderId: string | null;
  webViewLink: string | null;
}

export function DriveFolderCard({ employeeId, driveFolderId, webViewLink }: Props) {
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
        <h2 className="font-semibold text-gray-900">Drive Folder</h2>
      </CardHeader>
      <CardContent>
        {driveFolderId ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-700">
                This employee has a Drive folder for signed documents and uploads.
              </p>
              {webViewLink && (
                <a
                  href={webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                >
                  Open in Google Drive ↗
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-700">
              No Drive folder yet. Create one to enable file uploads and
              eSignature requests for this employee.
            </p>
            <Button onClick={createFolder} disabled={creating}>
              {creating ? "Creating…" : "Create Drive folder"}
            </Button>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
