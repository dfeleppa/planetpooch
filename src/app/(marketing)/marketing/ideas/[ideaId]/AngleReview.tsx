"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Angle, AngleStatus, EmotionalRegister, Platform } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ANGLE_STATUS_LABELS,
  ANGLE_STATUS_VARIANT,
  EMOTIONAL_REGISTERS,
  EMOTIONAL_REGISTER_LABELS,
  VISUAL_TREATMENT_SUGGESTIONS,
} from "@/lib/marketing/angles";
import {
  PLATFORM_LABELS,
  SCRIPT_MODELS,
  SCRIPT_MODEL_LABELS,
} from "@/lib/marketing/scripts";
import type { ScriptModel } from "@/lib/validators/marketing";

const PLATFORMS: Platform[] = [
  "MULTI",
  "REELS",
  "TIKTOK",
  "YT_SHORTS",
  "META_FEED",
  "FB_FEED",
];

type AngleRow = Pick<
  Angle,
  | "id"
  | "name"
  | "emotionalRegister"
  | "audiencePocket"
  | "coreMessage"
  | "visualTreatment"
  | "differentiator"
  | "status"
  | "wasEdited"
  | "model"
  | "voiceProfileVersion"
>;

type Props = {
  ideaId: string;
  angles: AngleRow[];
};

/**
 * The angle review step is where the human strategist adds value. The
 * generator produces 6–10 angles; the strategist edits, deselects,
 * regenerates one at a time, then batch-generates full scripts for the
 * selected set.
 */
export function AngleReview({ ideaId, angles: initialAngles }: Props) {
  const router = useRouter();
  const [angles, setAngles] = useState<AngleRow[]>(initialAngles);
  const [model, setModel] = useState<ScriptModel>("claude-haiku-4-5");
  const [platform, setPlatform] = useState<Platform>("MULTI");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const undiscarded = angles.filter((a) => a.status !== "DISCARDED");
  const selected = angles.filter((a) => a.status === "SELECTED");

  async function handleGenerateAll() {
    setError("");
    setBusy("generate-all");
    try {
      const res = await fetch(`/api/marketing/ideas/${ideaId}/angles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate angles");
      }
      const data = await res.json();
      setAngles((prev) => [...prev, ...data.angles]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate(angleId: string) {
    const guidance = window.prompt(
      "Optional nudge for the regeneration (e.g. 'punchier', 'less fear, more pride'). Leave blank for plain regenerate."
    );
    if (guidance === null) return; // user cancelled
    setError("");
    setBusy(angleId);
    try {
      const res = await fetch(
        `/api/marketing/angles/${angleId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            guidance: guidance.trim() || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to regenerate");
      }
      const data = await res.json();
      setAngles((prev) =>
        prev.map((a) => (a.id === angleId ? { ...a, ...data.angle } : a))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleStatusChange(angleId: string, status: AngleStatus) {
    setError("");
    // Optimistic update — the patch is fast and bouncy UI hurts the review
    // flow. On failure we revert.
    const prev = angles;
    setAngles((cur) => cur.map((a) => (a.id === angleId ? { ...a, status } : a)));
    try {
      const res = await fetch(`/api/marketing/angles/${angleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update angle");
      }
    } catch (err) {
      setAngles(prev);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleSaveEdit(angleId: string, patch: Partial<AngleRow>) {
    setError("");
    setBusy(angleId);
    try {
      const res = await fetch(`/api/marketing/angles/${angleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setAngles((prev) =>
        prev.map((a) => (a.id === angleId ? { ...a, ...patch, wasEdited: true } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateScripts() {
    if (selected.length === 0) return;
    setError("");
    setBusy("generate-scripts");
    try {
      const res = await fetch(`/api/marketing/ideas/${ideaId}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          angleIds: selected.map((a) => a.id),
          platform,
          model,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate scripts");
      }
      const data = await res.json();
      if (data.failures && data.failures.length > 0) {
        setError(
          `Generated ${data.created.length}/${selected.length} — ${data.failures.length} failed.`
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Angles</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Generate 6–10 distinct angles for this idea, then select 3–6 to
              turn into full scripts. The strategist&apos;s job is right
              here — edit, deselect, or regenerate one at a time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ScriptModel)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs bg-white"
              disabled={busy !== null}
            >
              {SCRIPT_MODELS.map((m) => (
                <option key={m} value={m}>
                  {SCRIPT_MODEL_LABELS[m]}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              onClick={handleGenerateAll}
              disabled={busy !== null}
            >
              {busy === "generate-all"
                ? "Generating…"
                : angles.length === 0
                ? "+ Generate angles"
                : "+ Generate more"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {undiscarded.length === 0 ? (
          <p className="text-sm text-gray-500">
            No angles yet. Click <strong>Generate angles</strong> to fan this
            idea out into 6–10 distinct concepts.
          </p>
        ) : (
          <div className="space-y-2">
            {undiscarded.map((angle) => (
              <AngleCard
                key={angle.id}
                angle={angle}
                busy={busy === angle.id}
                onStatusChange={(s) => handleStatusChange(angle.id, s)}
                onRegenerate={() => handleRegenerate(angle.id)}
                onSaveEdit={(patch) => handleSaveEdit(angle.id, patch)}
              />
            ))}
          </div>
        )}

        {undiscarded.length > 0 && (
          <div className="flex flex-col gap-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-700">
                <strong>{selected.length}</strong> selected ·{" "}
                {undiscarded.length} on the table
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs bg-white"
                  disabled={busy !== null}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleGenerateScripts}
                  disabled={busy !== null || selected.length === 0}
                >
                  {busy === "generate-scripts"
                    ? "Generating scripts…"
                    : `Generate ${selected.length} script${
                        selected.length === 1 ? "" : "s"
                      }`}
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              One full script per selected angle, generated in parallel. Pulls
              from the latest Voice Profile.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AngleCard({
  angle,
  busy,
  onStatusChange,
  onRegenerate,
  onSaveEdit,
}: {
  angle: AngleRow;
  busy: boolean;
  onStatusChange: (s: AngleStatus) => void;
  onRegenerate: () => void;
  onSaveEdit: (patch: Partial<AngleRow>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AngleRow>(angle);
  const isSelected = angle.status === "SELECTED" || angle.status === "GENERATED";
  const isGenerated = angle.status === "GENERATED";

  function commit() {
    onSaveEdit({
      name: draft.name,
      emotionalRegister: draft.emotionalRegister,
      audiencePocket: draft.audiencePocket,
      coreMessage: draft.coreMessage,
      visualTreatment: draft.visualTreatment,
      differentiator: draft.differentiator,
    });
    setEditing(false);
  }

  return (
    <div
      className={
        "rounded-lg border p-3 space-y-2 " +
        (isSelected
          ? "border-blue-300 bg-blue-50/40"
          : "border-gray-200 bg-white")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            disabled={busy || isGenerated}
            onChange={(e) =>
              onStatusChange(e.target.checked ? "SELECTED" : "DRAFT")
            }
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold"
              />
            ) : (
              <p className="text-sm font-semibold text-gray-900 truncate">
                {angle.name}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge variant="info">
                {EMOTIONAL_REGISTER_LABELS[angle.emotionalRegister]}
              </Badge>
              <Badge variant={ANGLE_STATUS_VARIANT[angle.status]}>
                {ANGLE_STATUS_LABELS[angle.status]}
              </Badge>
              {angle.wasEdited && (
                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                  edited
                </span>
              )}
            </div>
          </div>
        </label>
        <div className="flex items-center gap-1">
          {!isGenerated && (
            <button
              type="button"
              onClick={() => {
                if (editing) {
                  setDraft(angle);
                  setEditing(false);
                } else {
                  setEditing(true);
                }
              }}
              className="text-xs text-gray-600 hover:text-gray-900"
              disabled={busy}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
          {!isGenerated && (
            <button
              type="button"
              onClick={onRegenerate}
              className="text-xs text-gray-600 hover:text-gray-900"
              disabled={busy}
            >
              {busy ? "…" : "Regenerate"}
            </button>
          )}
          {!isGenerated && (
            <button
              type="button"
              onClick={() => onStatusChange("DISCARDED")}
              className="text-xs text-red-600 hover:text-red-700"
              disabled={busy}
            >
              Discard
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={draft.emotionalRegister}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  emotionalRegister: e.target.value as EmotionalRegister,
                })
              }
              className="rounded-md border border-gray-300 px-2 py-1 text-xs bg-white"
            >
              {EMOTIONAL_REGISTERS.map((r) => (
                <option key={r} value={r}>
                  {EMOTIONAL_REGISTER_LABELS[r]}
                </option>
              ))}
            </select>
            <input
              list={`treatments-${angle.id}`}
              value={draft.visualTreatment}
              onChange={(e) =>
                setDraft({ ...draft, visualTreatment: e.target.value })
              }
              placeholder="Visual treatment"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            />
            <datalist id={`treatments-${angle.id}`}>
              {VISUAL_TREATMENT_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <input
            value={draft.audiencePocket}
            onChange={(e) =>
              setDraft({ ...draft, audiencePocket: e.target.value })
            }
            placeholder="Audience pocket"
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
          <textarea
            rows={2}
            value={draft.coreMessage}
            onChange={(e) =>
              setDraft({ ...draft, coreMessage: e.target.value })
            }
            placeholder="Core message — one sentence"
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
          <textarea
            rows={2}
            value={draft.differentiator}
            onChange={(e) =>
              setDraft({ ...draft, differentiator: e.target.value })
            }
            placeholder="Why this is distinct from the others"
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={commit}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-700 space-y-1 pl-6">
          <p>
            <span className="font-medium text-gray-500">Pocket:</span>{" "}
            {angle.audiencePocket}
          </p>
          <p>
            <span className="font-medium text-gray-500">Core:</span>{" "}
            {angle.coreMessage}
          </p>
          <p>
            <span className="font-medium text-gray-500">Visual:</span>{" "}
            {angle.visualTreatment || "—"}
          </p>
          <p className="text-gray-500 italic">{angle.differentiator}</p>
        </div>
      )}
    </div>
  );
}
