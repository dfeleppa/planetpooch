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
  targetAudience: string;
  problemSolved: string;
  offer: string;
  offerMechanism: string;
  pricing: string;
  beforeAfterState: string;
  primaryObjections: string;
  acquisitionChannels: string;
  growthConstraint: string;
  uniqueMechanism: string;
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
  const [targetAudience, setTargetAudience] = useState(initial?.targetAudience ?? "");
  const [problemSolved, setProblemSolved] = useState(initial?.problemSolved ?? "");
  const [offer, setOffer] = useState(initial?.offer ?? "");
  const [offerMechanism, setOfferMechanism] = useState(initial?.offerMechanism ?? "");
  const [pricing, setPricing] = useState(initial?.pricing ?? "");
  const [beforeAfterState, setBeforeAfterState] = useState(initial?.beforeAfterState ?? "");
  const [primaryObjections, setPrimaryObjections] = useState(initial?.primaryObjections ?? "");
  const [acquisitionChannels, setAcquisitionChannels] = useState(initial?.acquisitionChannels ?? "");
  const [growthConstraint, setGrowthConstraint] = useState(initial?.growthConstraint ?? "");
  const [uniqueMechanism, setUniqueMechanism] = useState(initial?.uniqueMechanism ?? "");
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
          targetAudience,
          problemSolved,
          offer,
          offerMechanism,
          pricing,
          beforeAfterState,
          primaryObjections,
          acquisitionChannels,
          growthConstraint,
          uniqueMechanism,
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
              Business context
            </h2>
            <p className="text-xs text-gray-500">
              Defines what we do, not how we sound. The foundation every
              generation grounds in.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field
            label="Who is the specific target audience/avatar?"
            value={targetAudience}
            onChange={setTargetAudience}
            rows={3}
            placeholder="Pet parents in [metro], 30–55, household income $120K+, 1–2 dogs, treat the dog like family. Leans female, professional, often guilt-driven about long workdays."
          />
          <Field
            label="What is the specific problem you solve for them?"
            value={problemSolved}
            onChange={setProblemSolved}
            rows={3}
            placeholder="Their dog spends most of the day alone or in a cage at the vet. They want real care — outdoor time, attention, no stress — without the guilt of a bad alternative."
          />
          <Field
            label="What is the offer (Product/Service)?"
            value={offer}
            onChange={setOffer}
            rows={3}
            placeholder="Mobile grooming, daycare, overnight boarding (glass suites), and force-free training — under one roof or to your driveway."
          />
          <Field
            label="What is the core mechanism of the offer (How it works)?"
            value={offerMechanism}
            onChange={setOfferMechanism}
            rows={4}
            placeholder="Boarding: glass-walled suites with raised beds + TVs, twice-daily 1:1 enrichment, outdoor yard time. Mobile grooming: custom van pulls into the driveway, hydraulic table, warm-water bath, same groomer every visit."
          />
          <Field
            label="How is it priced?"
            value={pricing}
            onChange={setPricing}
            rows={3}
            placeholder="Boarding $95/night standard suite, $135 luxury suite. Mobile grooming $120–$185 depending on coat. Daycare $52/day, $450/10-pack. Training $180/private session, $295 for the 6-week group class."
          />
          <Field
            label='What is the "Before and After" state for the customer?'
            value={beforeAfterState}
            onChange={setBeforeAfterState}
            rows={4}
            placeholder="Before: dropping the dog at the vet kennel and feeling sick about it all weekend. After: getting a video of their dog napping in a real bed with a stuffed kong, and actually enjoying the trip."
          />
          <Field
            label="What are the primary objections to the offer?"
            value={primaryObjections}
            onChange={setPrimaryObjections}
            rows={4}
            placeholder={"- 'It's more expensive than the vet'\n- 'My dog has separation anxiety, won't handle it'\n- 'Can I trust strangers with my dog overnight?'\n- 'How is this different from PetSmart?'"}
          />
          <Field
            label="What are your currently profitable customer acquisition channels?"
            value={acquisitionChannels}
            onChange={setAcquisitionChannels}
            rows={3}
            placeholder="Organic short-form (Reels/TikTok) — strongest channel. Google Maps/local SEO. Meta paid for boarding promos. Word-of-mouth from groomers → boarding crossover."
          />
          <Field
            label="What is the current primary constraint/bottleneck to growth?"
            value={growthConstraint}
            onChange={setGrowthConstraint}
            rows={3}
            placeholder="Suite capacity on weekends — boarding sells out 4–6 weeks ahead in summer. Bottleneck is real estate, not demand."
          />
          <Field
            label="What is your unique mechanism (Why you over competitors)?"
            value={uniqueMechanism}
            onChange={setUniqueMechanism}
            rows={4}
            placeholder="No cages anywhere on property — full-stop. Glass suites, real beds, 1:1 enrichment twice a day. Vet boarding is ~3 short walks then back in a cage; PetSmart-style daycare is a warehouse room. We're the only operator in [metro] with outdoor grass yards + glass suites."
          />
        </CardContent>
      </Card>

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
