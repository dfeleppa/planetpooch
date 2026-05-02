"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICE_LINE_LABELS } from "@/lib/marketing/ideas";
import type { ServiceLine } from "@prisma/client";

const SERVICE_LINES: ServiceLine[] = [
  "GROOMING",
  "DAYCARE",
  "BOARDING",
  "TRAINING",
  "MULTIPLE",
];

export function NewIdeaForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [insight, setInsight] = useState("");
  const [audience, setAudience] = useState("");
  const [serviceLine, setServiceLine] = useState<ServiceLine>("BOARDING");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/marketing/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          insight,
          audience,
          serviceLine,
          tags,
          notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create idea");
      }
      const idea = await res.json();
      router.push(`/marketing/ideas/${idea.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Vet boarding vs. our luxury suites"
            required
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Insight
            </label>
            <p className="text-xs text-gray-500">
              The observation this campaign exploits. The script will be
              built around this.
            </p>
            <textarea
              rows={5}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={insight}
              onChange={(e) => setInsight(e.target.value)}
              placeholder="Pet parents board at the vet thinking it's safer. Reality: ~3 walks a day, 21 hours in a cage. We offer 1:1 enrichment, outdoor play, glass suites with beds and TVs, and luxury 'tuck-in' addons."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Service line
              </label>
              <select
                value={serviceLine}
                onChange={(e) => setServiceLine(e.target.value as ServiceLine)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {SERVICE_LINES.map((line) => (
                  <option key={line} value={line}>
                    {SERVICE_LINE_LABELS[line]}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="First-time pet parents, vet-boarders"
            />
          </div>

          <Input
            label="Tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="comma, separated, tags"
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={3}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal context — competitors to reference, pricing to highlight, anything else."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Creating…" : "Create idea"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
