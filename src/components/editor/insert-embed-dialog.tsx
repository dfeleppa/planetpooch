"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseGoogleDriveUrl } from "./extensions/google-drive-embed";

interface InsertEmbedDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (embedUrl: string) => void;
}

export function InsertEmbedDialog({ open, onClose, onInsert }: InsertEmbedDialogProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const embedUrl = parseGoogleDriveUrl(url);
    if (!embedUrl) {
      setError("Could not parse this URL. Please paste a Google Drive, Google Docs, or YouTube link.");
      return;
    }

    onInsert(embedUrl);
    setUrl("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900">Insert Embed</h3>
        <p className="mt-1 text-sm text-gray-500">
          Paste a Google Drive, Google Docs, Sheets, Slides, or YouTube link.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <Input
            id="embed-url"
            placeholder="https://drive.google.com/file/d/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={error}
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setUrl("");
                setError("");
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Insert</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
