"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HookStatus, Platform, ScriptStatus } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HOOK_STATUS_LABELS,
  HOOK_STATUS_VARIANT,
  PLATFORM_LABELS,
  SCRIPT_STATUS_LABELS,
  SCRIPT_STATUS_VARIANT,
} from "@/lib/marketing/scripts";

const PLATFORMS: Platform[] = [
  "MULTI",
  "REELS",
  "TIKTOK",
  "YT_SHORTS",
  "META_FEED",
  "FB_FEED",
];
const SCRIPT_STATUSES: ScriptStatus[] = [
  "DRAFT",
  "APPROVED",
  "FILMED",
  "POSTED",
  "ARCHIVED",
];
const HOOK_STATUSES: HookStatus[] = [
  "DRAFT",
  "APPROVED",
  "REJECTED",
  "WINNER",
];

type HookProp = {
  id: string;
  label: string;
  text: string;
  order: number;
  status: HookStatus;
  notes: string;
};

type ScriptProp = {
  id: string;
  ideaId: string;
  ideaTitle: string;
  body: string;
  platform: Platform;
  status: ScriptStatus;
  notes: string;
  voiceProfileVersion: number | null;
  model: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  hooks: HookProp[];
};

export function ScriptEditor({ script }: { script: ScriptProp }) {
  const router = useRouter();

  const [body, setBody] = useState(script.body);
  const [platform, setPlatform] = useState<Platform>(script.platform);
  const [status, setStatus] = useState<ScriptStatus>(script.status);
  const [notes, setNotes] = useState(script.notes);
  const [hooks, setHooks] = useState<HookProp[]>(script.hooks);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSavedAt(null);
    setSaving(true);
    try {
      const scriptRes = await fetch(`/api/marketing/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, platform, status, notes }),
      });
      if (!scriptRes.ok) {
        const data = await scriptRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save script");
      }

      const dirtyHooks = hooks.filter((h) => {
        const orig = script.hooks.find((o) => o.id === h.id);
        if (!orig) return false;
        return (
          h.label !== orig.label ||
          h.text !== orig.text ||
          h.status !== orig.status ||
          h.notes !== orig.notes
        );
      });

      for (const h of dirtyHooks) {
        const res = await fetch(`/api/marketing/hooks/${h.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: h.label,
            text: h.text,
            status: h.status,
            notes: h.notes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to save hook ${h.label}`);
        }
      }

      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteScript() {
    if (
      !confirm(
        "Delete this script and all of its hooks? This cannot be undone."
      )
    ) {
      return;
    }
    setError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/marketing/scripts/${script.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      router.push(`/marketing/ideas/${script.ideaId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  async function handleDeleteHook(hookId: string) {
    if (!confirm("Delete this hook?")) return;
    try {
      const res = await fetch(`/api/marketing/hooks/${hookId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete hook");
      }
      setHooks((prev) => prev.filter((h) => h.id !== hookId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function updateHook<K extends keyof HookProp>(
    id: string,
    field: K,
    value: HookProp[K]
  ) {
    setHooks((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: value } : h))
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Script</h1>
          <p className="text-xs text-gray-500 mt-1">
            For idea: {script.ideaTitle} ·{" "}
            {script.createdByName ?? "—"} ·{" "}
            {new Date(script.createdAt).toLocaleDateString()}
            {script.voiceProfileVersion !== null && (
              <> · generated against voice v{script.voiceProfileVersion}</>
            )}
            {script.model && <> · model {script.model}</>}
          </p>
        </div>
        <Badge variant={SCRIPT_STATUS_VARIANT[status]}>
          {SCRIPT_STATUS_LABELS[status]}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">Body</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ScriptStatus)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                {SCRIPT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SCRIPT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Script body
            </label>
            <textarea
              rows={10}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={3}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">
            Hooks ({hooks.length})
          </h2>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {hooks.length === 0 ? (
            <p className="text-sm text-gray-500">No hooks yet.</p>
          ) : (
            hooks.map((h) => (
              <div
                key={h.id}
                className="rounded-lg border border-gray-200 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={h.label}
                    onChange={(e) =>
                      updateHook(h.id, "label", e.target.value)
                    }
                    placeholder="Hook label (e.g., 'cage vs. suite')"
                    className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                  <Badge variant={HOOK_STATUS_VARIANT[h.status]}>
                    {HOOK_STATUS_LABELS[h.status]}
                  </Badge>
                </div>
                <textarea
                  rows={2}
                  value={h.text}
                  onChange={(e) => updateHook(h.id, "text", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={h.status}
                    onChange={(e) =>
                      updateHook(h.id, "status", e.target.value as HookStatus)
                    }
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs bg-white"
                  >
                    {HOOK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {HOOK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleDeleteHook(h.id)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Delete hook
                  </button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedAt && (
        <p className="text-sm text-green-700">Saved at {savedAt}.</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleDeleteScript}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete script"}
        </Button>
      </div>
    </form>
  );
}
