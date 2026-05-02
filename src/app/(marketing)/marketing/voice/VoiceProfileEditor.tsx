"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type InitialProfile = {
  version: number;
  tone: string;
  doRules: string;
  dontRules: string;
  bannedPhrases: string[];
  complianceRules: string;
  exemplars: string;
  notes: string;
  createdAt: string;
};

type Props = {
  initial: InitialProfile | null;
};

export function VoiceProfileEditor({ initial }: Props) {
  const router = useRouter();
  const [tone, setTone] = useState(initial?.tone ?? "");
  const [doRules, setDoRules] = useState(initial?.doRules ?? "");
  const [dontRules, setDontRules] = useState(initial?.dontRules ?? "");
  const [bannedPhrasesText, setBannedPhrasesText] = useState(
    (initial?.bannedPhrases ?? []).join("\n")
  );
  const [complianceRules, setComplianceRules] = useState(
    initial?.complianceRules ?? ""
  );
  const [exemplars, setExemplars] = useState(initial?.exemplars ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSavedVersion(null);
    setSaving(true);
    try {
      const bannedPhrases = bannedPhrasesText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);

      const res = await fetch("/api/marketing/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone,
          doRules,
          dontRules,
          bannedPhrases,
          complianceRules,
          exemplars,
          notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save voice profile");
      }
      const saved = await res.json();
      setSavedVersion(saved.version);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const versionLabel = initial
    ? `Editing on top of v${initial.version} · last saved ${new Date(
        initial.createdAt
      ).toLocaleString()}`
    : "No version saved yet — your first save will be v1";

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Voice profile
            </h2>
            <p className="text-xs text-gray-500">{versionLabel}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field
            label="Tone"
            help="A few sentences describing how Planet Pooch sounds. Imagine briefing a new copywriter."
            value={tone}
            onChange={setTone}
            rows={4}
            placeholder="Warm, dog-obsessed, mildly cheeky. Speaks to the pet parent like a trusted friend who happens to know dogs better than the vet."
          />
          <Field
            label="Do"
            help="Concrete things every piece of copy should do."
            value={doRules}
            onChange={setDoRules}
            rows={5}
            placeholder={"- Lead with a pet-parent fear or wish\n- Use sensory detail (smell, sound, sight)\n- Name our specific differentiators (glass suites, 1:1 enrichment, tuck-ins)"}
          />
          <Field
            label="Don't"
            help="Hard rules. The generator will avoid these."
            value={dontRules}
            onChange={setDontRules}
            rows={5}
            placeholder={"- Don't make medical/health claims\n- Don't compare us to a specific competitor by name\n- Don't use 'fur baby' or 'pup-arent'"}
          />
          <Field
            label="Banned phrases"
            help="One per line. Generators will reject any output containing these."
            value={bannedPhrasesText}
            onChange={setBannedPhrasesText}
            rows={4}
            placeholder={"fur baby\nbest in [city]\nguaranteed"}
            mono
          />
          <Field
            label="Compliance rules"
            help="Anything legal/regulatory copy must follow."
            value={complianceRules}
            onChange={setComplianceRules}
            rows={4}
            placeholder="No statements that imply medical care or replace a vet. Disclose 'professional grooming' for any 'spa' language."
          />
          <Field
            label="Exemplars"
            help="Paste 3–10 of your best-performing scripts/hooks/copy. The generator matches their energy. Refresh this whenever you have new winners."
            value={exemplars}
            onChange={setExemplars}
            rows={10}
            placeholder={"Hook (vet boarding, July 2026, 1.2M views):\n\"Most vets walk your dog 3 times a day. The other 21 hours? In a cage.\"\n..."}
            mono
          />
          <Field
            label="Notes"
            help="Internal-only — what changed in this version, why, what to watch for."
            value={notes}
            onChange={setNotes}
            rows={3}
            placeholder="Loosened tone after the vet-cage hook overperformed; allowing more direct comparisons to the alternative."
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {savedVersion !== null && (
            <p className="text-sm text-green-700">
              Saved as v{savedVersion}. All new generations will use this version.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save as new version"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  rows,
  placeholder,
  mono,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {help && <p className="text-xs text-gray-500">{help}</p>}
      <textarea
        rows={rows}
        className={
          "rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 " +
          (mono ? "font-mono text-[13px]" : "")
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
