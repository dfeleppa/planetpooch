"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  IDEA_STATUS_LABELS,
  IDEA_STATUS_VARIANT,
  SERVICE_LINE_LABELS,
} from "@/lib/marketing/ideas";
import type { IdeaStatus, ServiceLine } from "@prisma/client";

const SERVICE_LINES: ServiceLine[] = [
  "GROOMING",
  "DAYCARE",
  "BOARDING",
  "TRAINING",
  "MULTIPLE",
];
const STATUSES: IdeaStatus[] = [
  "DRAFT",
  "IN_PRODUCTION",
  "SHIPPED",
  "ARCHIVED",
];
type MarketingObjective = "LEADS" | "BOOKINGS" | "SALES" | "AWARENESS";
type MarketingChannel = "META" | "GOOGLE_SEARCH";

const OBJECTIVE_LABELS: Record<MarketingObjective, string> = {
  LEADS: "Generate leads",
  BOOKINGS: "Drive bookings",
  SALES: "Drive sales",
  AWARENESS: "Build awareness",
};

type IdeaProp = {
  id: string;
  title: string;
  insight: string;
  audience: string;
  serviceLine: ServiceLine;
  objective: string;
  channels: string[];
  offer: string;
  proof: string;
  status: IdeaStatus;
  tags: string[];
  notes: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export function IdeaEditor({ idea }: { idea: IdeaProp }) {
  const router = useRouter();
  const [title, setTitle] = useState(idea.title);
  const [insight, setInsight] = useState(idea.insight);
  const [audience, setAudience] = useState(idea.audience);
  const [serviceLine, setServiceLine] = useState<ServiceLine>(idea.serviceLine);
  const [objective, setObjective] = useState<MarketingObjective>(idea.objective as MarketingObjective);
  const [channels, setChannels] = useState<MarketingChannel[]>(idea.channels as MarketingChannel[]);
  const [offer, setOffer] = useState(idea.offer);
  const [proof, setProof] = useState(idea.proof);
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [tagsText, setTagsText] = useState(idea.tags.join(", "));
  const [notes, setNotes] = useState(idea.notes);

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
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(`/api/marketing/ideas/${idea.id}`, {
        method: "PATCH",
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
          status,
          tags,
          notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this content brief and every generated asset attached to it?"
      )
    ) {
      return;
    }
    setError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/marketing/ideas/${idea.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      router.push("/marketing/create");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {idea.title || "Untitled brief"}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Created by {idea.createdByName ?? "—"} ·{" "}
            {new Date(idea.createdAt).toLocaleDateString()}
            {idea.updatedAt !== idea.createdAt && (
              <>
                {" "}· updated {new Date(idea.updatedAt).toLocaleDateString()}
              </>
            )}
          </p>
        </div>
        <Badge variant={IDEA_STATUS_VARIANT[status]}>
          {IDEA_STATUS_LABELS[status]}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">
            Content brief
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Customer insight
            </label>
            <p className="text-xs text-gray-500">
              The customer truth this campaign should exploit—not the pitch itself.
            </p>
            <textarea
              rows={6}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={insight}
              onChange={(e) => setInsight(e.target.value)}
              placeholder="Vets boarding dogs walk them ~3 times a day. The other 21 hours, the dog is in a cage."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Service line
              </label>
              <select
                value={serviceLine}
                onChange={(e) =>
                  setServiceLine(e.target.value as ServiceLine)
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {SERVICE_LINES.map((line) => (
                  <option key={line} value={line}>
                    {SERVICE_LINE_LABELS[line]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Objective</label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value as MarketingObjective)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(OBJECTIVE_LABELS) as MarketingObjective[]).map((value) => (
                  <option key={value} value={value}>{OBJECTIVE_LABELS[value]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as IdeaStatus)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {IDEA_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Loose: people who might care"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Offer</label>
              <textarea
                rows={4}
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="What the customer gets, relevant pricing or promotion, and the desired next step."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Proof and differentiators</label>
              <textarea
                rows={4}
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                placeholder="Verified facts, testimonials, service details, or reasons to believe."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Channels</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {([ ["META", "Meta"], ["GOOGLE_SEARCH", "Google Search"] ] as const).map(([value, label]) => {
                const active = channels.includes(value);
                return (
                  <label key={value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${active ? "border-blue-600 bg-blue-50 text-blue-800" : "border-gray-300 bg-white text-gray-600"}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={active}
                      onChange={() => setChannels((current) => current.includes(value) ? (current.length > 1 ? current.filter((channel) => channel !== value) : current) : [...current, value])}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>

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
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {savedAt && (
            <p className="text-sm text-green-700">Saved at {savedAt}.</p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete brief"}
            </Button>
          </div>
        </CardContent>
      </Card>

    </form>
  );
}
