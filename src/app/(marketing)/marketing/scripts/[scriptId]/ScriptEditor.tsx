"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  EmotionalRegister,
  HookStatus,
  Platform,
  ScriptStatus,
} from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HOOK_STATUS_LABELS,
  HOOK_STATUS_VARIANT,
  PLATFORM_LABELS,
  SCRIPT_MODELS,
  SCRIPT_MODEL_LABELS,
  SCRIPT_STATUS_LABELS,
  SCRIPT_STATUS_VARIANT,
} from "@/lib/marketing/scripts";
import { EMOTIONAL_REGISTER_LABELS } from "@/lib/marketing/angles";
import type { ScriptModel } from "@/lib/validators/marketing";

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
  angle: {
    id: string;
    name: string;
    emotionalRegister: EmotionalRegister;
    audiencePocket: string;
  } | null;
  hook: string;
  body: string;
  cta: string;
  shotList: string[];
  onScreenTextStyle: string;
  musicTone: string;
  lengthTarget: string;
  platform: Platform;
  status: ScriptStatus;
  notes: string;
  voiceProfileVersion: number | null;
  model: string | null;
  metaAdSlug: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  hooks: HookProp[];
};

export function ScriptEditor({ script }: { script: ScriptProp }) {
  const router = useRouter();

  const [hook, setHook] = useState(script.hook);
  const [body, setBody] = useState(script.body);
  const [cta, setCta] = useState(script.cta);
  const [shotListText, setShotListText] = useState(script.shotList.join("\n"));
  const [onScreenTextStyle, setOnScreenTextStyle] = useState(
    script.onScreenTextStyle
  );
  const [musicTone, setMusicTone] = useState(script.musicTone);
  const [lengthTarget, setLengthTarget] = useState(script.lengthTarget);
  const [platform, setPlatform] = useState<Platform>(script.platform);
  const [status, setStatus] = useState<ScriptStatus>(script.status);
  const [notes, setNotes] = useState(script.notes);
  const [metaAdSlug, setMetaAdSlug] = useState(script.metaAdSlug ?? "");
  const [hooks, setHooks] = useState<HookProp[]>(script.hooks);

  const [variantsModel, setVariantsModel] = useState<ScriptModel>("claude-haiku-4-5");
  const [variantsCount, setVariantsCount] = useState(4);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [generatingVariants, setGeneratingVariants] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // `WINNER` is a HookStatus, not a ScriptStatus — a script "earns variants"
  // by reaching POSTED or by having a hook flagged WINNER. Pure UI hint;
  // the server doesn't enforce this gate.
  const variantsRecommended =
    status === "POSTED" ||
    hooks.some((h) => h.status === "WINNER");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSavedAt(null);
    setSaving(true);
    try {
      const shotList = shotListText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const scriptRes = await fetch(`/api/marketing/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hook,
          body,
          cta,
          shotList,
          onScreenTextStyle,
          musicTone,
          lengthTarget,
          platform,
          status,
          notes,
          metaAdSlug: metaAdSlug.trim(),
        }),
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
        "Delete this script and all of its hook variants? This cannot be undone."
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
    if (!confirm("Delete this hook variant?")) return;
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

  async function handleGenerateVariants() {
    setError("");
    setGeneratingVariants(true);
    try {
      const res = await fetch(
        `/api/marketing/scripts/${script.id}/hook-variants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: variantsCount, model: variantsModel }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate variants");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGeneratingVariants(false);
    }
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

      {script.angle && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wide text-gray-500">
                Angle
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {script.angle.name}
              </span>
              <Badge variant="info">
                {EMOTIONAL_REGISTER_LABELS[script.angle.emotionalRegister]}
              </Badge>
              <span className="text-xs text-gray-600">
                · pocket: {script.angle.audiencePocket}
              </span>
              <Link
                href={`/marketing/ideas/${script.ideaId}`}
                className="text-xs text-blue-600 hover:text-blue-700 ml-auto"
              >
                View other angles →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">Script</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Length target
              </label>
              <input
                value={lengthTarget}
                onChange={(e) => setLengthTarget(e.target.value)}
                placeholder="15s | 30s | 60s"
                list="length-targets"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
              <datalist id="length-targets">
                <option value="15s" />
                <option value="30s" />
                <option value="60s" />
              </datalist>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Hook (first 2–3 seconds)
            </label>
            <textarea
              rows={2}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="One sentence, the first 2–3 seconds."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Body (~80–200 words after the hook)
            </label>
            <textarea
              rows={8}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">CTA</label>
            <textarea
              rows={2}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="DM us 'tour' for a same-week walkthrough."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Shot list
            </label>
            <p className="text-xs text-gray-500">
              One shot per line. Match the angle&apos;s visual treatment.
            </p>
            <textarea
              rows={6}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={shotListText}
              onChange={(e) => setShotListText(e.target.value)}
              placeholder={
                "Talking head: groomer in van, soft window light\nClose-up: warm water rinsing soaped golden\n…"
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                On-screen text style
              </label>
              <input
                value={onScreenTextStyle}
                onChange={(e) => setOnScreenTextStyle(e.target.value)}
                placeholder="bold kinetic | clean caption | none"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Music tone
              </label>
              <input
                value={musicTone}
                onChange={(e) => setMusicTone(e.target.value)}
                placeholder="calm acoustic | energetic pop | none"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
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

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Meta ad slug
            </label>
            <input
              type="text"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={metaAdSlug}
              onChange={(e) => setMetaAdSlug(e.target.value)}
              placeholder="pp-grm-suite-tour"
              pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?"
            />
            <p className="text-xs text-gray-500">
              Paste this string into the Meta ad name. Insights matching the
              substring auto-link to this script. Lowercase letters, digits,
              and dashes only.
            </p>
          </div>
        </CardContent>
      </Card>

      <details
        open={variantsOpen}
        onToggle={(e) => setVariantsOpen(e.currentTarget.open)}
        className="rounded-lg border border-gray-200 bg-gray-50/40"
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
          Hook variants ({hooks.length})
          {!variantsRecommended && (
            <span className="ml-2 text-xs text-gray-500">
              — Andromeda penalises near-duplicate creatives. Only generate
              variants once this script is a proven winner.
            </span>
          )}
        </summary>
        <div className="px-4 pb-4 pt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={2}
              max={8}
              value={variantsCount}
              onChange={(e) => setVariantsCount(Number(e.target.value))}
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm bg-white"
              disabled={generatingVariants}
            />
            <span className="text-xs text-gray-600">variants</span>
            <select
              value={variantsModel}
              onChange={(e) => setVariantsModel(e.target.value as ScriptModel)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs bg-white"
              disabled={generatingVariants}
            >
              {SCRIPT_MODELS.map((m) => (
                <option key={m} value={m}>
                  {SCRIPT_MODEL_LABELS[m]}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerateVariants}
              disabled={generatingVariants || !hook}
            >
              {generatingVariants ? "Generating…" : "Generate variants"}
            </Button>
            {!hook && (
              <span className="text-xs text-red-600">
                Save a hook first.
              </span>
            )}
          </div>

          {hooks.length === 0 ? (
            <p className="text-sm text-gray-500">No variants yet.</p>
          ) : (
            <div className="space-y-2">
              {hooks.map((h) => (
                <div
                  key={h.id}
                  className="rounded-lg border border-gray-200 p-3 space-y-2 bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <input
                      value={h.label}
                      onChange={(e) =>
                        updateHook(h.id, "label", e.target.value)
                      }
                      placeholder="Variant label"
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
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {variantsRecommended && (
            <p className="text-xs text-green-700">
              This script has earned variants — generate away.
            </p>
          )}
        </div>
      </details>

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
