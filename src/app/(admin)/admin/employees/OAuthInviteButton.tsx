"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OAuthInviteButton({ employeeId }: { employeeId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true); setError(""); setUrl("");
    try {
      const res = await fetch(`/api/employees/${employeeId}/oauth-invite`, { method: "POST" });
      if (!res.ok) throw new Error("Could not generate connection link.");
      setUrl((await res.json()).url);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <p className="text-sm text-gray-600">Connect Google or Apple to this existing employee account. Share the link privately after verifying their identity. It expires in 30 minutes and can be used once. Generating another replaces the previous link.</p>
    <Button type="button" disabled={busy} onClick={generate}>{busy ? "Generating…" : "Generate account connection link"}</Button>
    {url && <input aria-label="Account connection link" className="w-full border rounded p-2 text-sm" readOnly value={url} onFocus={(e) => e.target.select()} />}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
