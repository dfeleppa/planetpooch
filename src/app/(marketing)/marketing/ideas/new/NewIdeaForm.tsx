"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICE_LINE_LABELS } from "@/lib/marketing/ideas";
import type { ServiceLine } from "@prisma/client";

const SERVICE_LINES: ServiceLine[] = ["GROOMING", "DAYCARE", "BOARDING", "TRAINING", "MULTIPLE"];
const OBJECTIVES = [
  { value: "LEADS", label: "Generate leads" },
  { value: "BOOKINGS", label: "Drive bookings" },
  { value: "SALES", label: "Drive sales" },
  { value: "AWARENESS", label: "Build awareness" },
] as const;
type Objective = (typeof OBJECTIVES)[number]["value"];
type Channel = "META" | "GOOGLE_SEARCH";

export function NewIdeaForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [insight, setInsight] = useState("");
  const [audience, setAudience] = useState("");
  const [serviceLine, setServiceLine] = useState<ServiceLine>("BOARDING");
  const [objective, setObjective] = useState<Objective>("LEADS");
  const [channels, setChannels] = useState<Channel[]>(["META", "GOOGLE_SEARCH"]);
  const [offer, setOffer] = useState("");
  const [proof, setProof] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const tags = tagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
      const response = await fetch("/api/marketing/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          insight,
          audience,
          serviceLine,
          objective,
          channels,
          offer,
          proof,
          tags,
          notes,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create brief");
      router.push(`/marketing/create/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.length > 1
          ? current.filter((item) => item !== channel)
          : current
        : [...current, channel]
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-6 py-6">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <Input
              label="Brief name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Luxury boarding for anxious pet parents"
              required
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Service</label>
              <select
                value={serviceLine}
                onChange={(event) => setServiceLine(event.target.value as ServiceLine)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SERVICE_LINES.map((line) => <option key={line} value={line}>{SERVICE_LINE_LABELS[line]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Objective</label>
              <select
                value={objective}
                onChange={(event) => setObjective(event.target.value as Objective)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {OBJECTIVES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <Input
              label="Audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder="Pet parents who currently board at a vet"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Create for</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {([ ["META", "Meta"], ["GOOGLE_SEARCH", "Google Search"] ] as const).map(([value, label]) => {
                const active = channels.includes(value);
                return (
                  <label key={value} className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${active ? "border-blue-600 bg-blue-50 font-medium text-blue-800" : "border-gray-300 bg-white text-gray-600"}`}>
                    <input type="checkbox" className="sr-only" checked={active} onChange={() => toggleChannel(value)} />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Customer insight</label>
            <p className="text-xs text-gray-500">The truth, fear, desire, or frustration the campaign should lead with.</p>
            <textarea
              rows={5}
              value={insight}
              onChange={(event) => setInsight(event.target.value)}
              placeholder="Pet parents choose vet boarding because it feels safer, but most dogs spend the majority of the day in a cage."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Offer</label>
              <textarea
                rows={4}
                value={offer}
                onChange={(event) => setOffer(event.target.value)}
                placeholder="The service, promotion, pricing context, and desired next step."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Proof and differentiators</label>
              <textarea
                rows={4}
                value={proof}
                onChange={(event) => setProof(event.target.value)}
                placeholder="Glass suites, outdoor yards, twice-daily enrichment, testimonials, or verified results."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <details className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Additional context</summary>
            <div className="mt-4 space-y-4">
              <Input label="Tags" value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="summer, anxiety, first-time" />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Internal notes</label>
                <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
          </details>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? "Creating…" : "Create brief"}</Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
