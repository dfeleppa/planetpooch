"use client";

import Link from "next/link";
import type { EmotionalRegister, Platform, ScriptStatus } from "@prisma/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PLATFORM_LABELS,
  SCRIPT_STATUS_LABELS,
  SCRIPT_STATUS_VARIANT,
} from "@/lib/marketing/scripts";
import { EMOTIONAL_REGISTER_LABELS } from "@/lib/marketing/angles";

type ScriptSummary = {
  id: string;
  hook: string;
  body: string;
  status: ScriptStatus;
  platform: Platform;
  createdAt: string;
  voiceProfileVersion: number | null;
  angle: {
    id: string;
    name: string;
    emotionalRegister: EmotionalRegister;
  } | null;
};

type Props = {
  scripts: ScriptSummary[];
};

const LEGACY_KEY = "__legacy__";

/**
 * Read-only listing of scripts for an idea. Generation now happens via the
 * AngleReview card above — this section just surfaces the resulting scripts,
 * grouped by their angle so the strategist can see "we have 3 angles
 * shipped, 2 still need scripts".
 */
export function ScriptsSection({ scripts }: Props) {
  if (scripts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">Scripts</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            No scripts yet. Generate angles above, then select 3–6 to turn
            into full scripts.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by angle so the leaderboard reads like a strategist's mental model.
  // Pre-Andromeda scripts (no angle) go in a single legacy bucket at the end.
  const groups = new Map<
    string,
    { angle: ScriptSummary["angle"] | null; scripts: ScriptSummary[] }
  >();
  for (const s of scripts) {
    const key = s.angle?.id ?? LEGACY_KEY;
    const existing = groups.get(key);
    if (existing) {
      existing.scripts.push(s);
    } else {
      groups.set(key, { angle: s.angle, scripts: [s] });
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-gray-900">
          Scripts ({scripts.length})
        </h2>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {Array.from(groups.values()).map((group, i) => (
          <div key={group.angle?.id ?? `legacy-${i}`}>
            <div className="flex items-center gap-2 mb-2">
              {group.angle ? (
                <>
                  <h3 className="text-sm font-semibold text-gray-800">
                    {group.angle.name}
                  </h3>
                  <Badge variant="info">
                    {EMOTIONAL_REGISTER_LABELS[group.angle.emotionalRegister]}
                  </Badge>
                </>
              ) : (
                <h3 className="text-sm font-semibold text-gray-500">
                  Pre-Andromeda scripts (no angle)
                </h3>
              )}
            </div>
            <div className="space-y-2">
              {group.scripts.map((s) => (
                <Link
                  key={s.id}
                  href={`/marketing/scripts/${s.id}`}
                  className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">
                      {s.hook || "(no hook)"}
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
                    {s.voiceProfileVersion !== null && (
                      <span>voice v{s.voiceProfileVersion}</span>
                    )}
                    <span className="ml-auto">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
