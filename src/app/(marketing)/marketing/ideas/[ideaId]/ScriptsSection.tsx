"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Platform, ScriptStatus } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PLATFORM_LABELS,
  SCRIPT_MODEL_LABELS,
  SCRIPT_MODELS,
  SCRIPT_STATUS_LABELS,
  SCRIPT_STATUS_VARIANT,
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

type ScriptSummary = {
  id: string;
  body: string;
  status: ScriptStatus;
  platform: Platform;
  hookCount: number;
  firstHookText: string;
  createdAt: string;
  voiceProfileVersion: number | null;
};

type Props = {
  ideaId: string;
  scripts: ScriptSummary[];
};

export function ScriptsSection({ ideaId, scripts }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [scriptCount, setScriptCount] = useState(3);
  const [hooksPerScript, setHooksPerScript] = useState(5);
  const [platform, setPlatform] = useState<Platform>("MULTI");
  const [model, setModel] = useState<ScriptModel>("claude-haiku-4-5");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGenerating(true);
    try {
      const res = await fetch(`/api/marketing/ideas/${ideaId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptCount, hooksPerScript, platform, model }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Scripts &amp; hooks
          </h2>
          {!showForm && (
            <Button
              type="button"
              size="sm"
              onClick={() => setShowForm(true)}
              disabled={generating}
            >
              + Generate scripts
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {showForm && (
          <form
            onSubmit={handleGenerate}
            className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">
                  Scripts
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={scriptCount}
                  onChange={(e) => setScriptCount(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">
                  Hooks per script
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={hooksPerScript}
                  onChange={(e) => setHooksPerScript(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ScriptModel)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
              >
                {SCRIPT_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {SCRIPT_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-gray-500">
              Uses the latest Voice Profile. Takes 5-15 seconds.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={generating}>
                {generating ? "Generating…" : "Generate"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowForm(false)}
                disabled={generating}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {scripts.length === 0 && !showForm ? (
          <p className="text-sm text-gray-500">
            No scripts yet. Click <strong>Generate scripts</strong> to create
            the first batch.
          </p>
        ) : (
          <div className="space-y-2">
            {scripts.map((s) => (
              <Link
                key={s.id}
                href={`/marketing/scripts/${s.id}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">
                    {s.firstHookText || "(no hook)"}
                  </p>
                  <Badge variant={SCRIPT_STATUS_VARIANT[s.status]}>
                    {SCRIPT_STATUS_LABELS[s.status]}
                  </Badge>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                  {s.body || "(no body)"}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Badge variant="info">{PLATFORM_LABELS[s.platform]}</Badge>
                  <span>
                    {s.hookCount} hook{s.hookCount === 1 ? "" : "s"}
                  </span>
                  {s.voiceProfileVersion !== null && (
                    <span>· voice v{s.voiceProfileVersion}</span>
                  )}
                  <span className="ml-auto">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
