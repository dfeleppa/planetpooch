"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  employeeId: string;
}

/**
 * Stopgap for super admins until transactional email is configured.
 * Generates a fresh temp password server-side and reveals it once. Each
 * click invalidates the previous value. Server enforces SUPER_ADMIN — this
 * component should still only be rendered for super admins to avoid
 * showing managers a button they can't use.
 */
export function RevealTempPasswordButton({ employeeId }: Props) {
  const [generating, setGenerating] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setGenerating(true);
    setError("");
    setCopied(false);
    try {
      const res = await fetch(
        `/api/employees/${employeeId}/reset-temp-password`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate password");
      setTempPassword(data.tempPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate password");
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (tempPassword) {
    return (
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
        <p className="text-sm font-medium text-yellow-900">
          Temporary password — shown only once
        </p>
        <p className="text-xs text-yellow-800 mt-1">
          Copy this and share it securely with the employee. They will be
          required to change it on first login. Generating again will invalidate
          this one.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded bg-white border border-yellow-300 px-3 py-2 text-sm font-mono">
            {tempPassword}
          </code>
          <Button type="button" variant="secondary" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={generate}
            disabled={generating}
          >
            {generating ? "Generating…" : "Generate again"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        onClick={generate}
        disabled={generating}
      >
        {generating ? "Generating…" : "Generate temp password"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
