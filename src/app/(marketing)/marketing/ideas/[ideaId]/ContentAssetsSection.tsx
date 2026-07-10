"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type AssetStatus = "DRAFT" | "READY" | "LIVE" | "WINNER" | "RETIRED";
type AssetType = "META_AD" | "GOOGLE_SEARCH_AD";

type Asset = {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  content: unknown;
  model: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  LIVE: "Live",
  WINNER: "Winner",
  RETIRED: "Retired",
};

const STATUS_VARIANTS: Record<AssetStatus, "default" | "info" | "success" | "warning"> = {
  DRAFT: "default",
  READY: "info",
  LIVE: "warning",
  WINNER: "success",
  RETIRED: "default",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function assetAsText(asset: Asset): string {
  if (!isRecord(asset.content)) return asset.name;
  return Object.entries(asset.content)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}\n${value
          .map((item) => (typeof item === "string" ? `- ${item}` : JSON.stringify(item)))
          .join("\n")}`;
      }
      return `${key}\n${String(value)}`;
    })
    .join("\n\n");
}

export function ContentAssetsSection({ ideaId, initialAssets }: { ideaId: string; initialAssets: Asset[] }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [generating, setGenerating] = useState<AssetType | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function generate(type: AssetType) {
    setGenerating(type);
    setError("");
    try {
      const response = await fetch(`/api/marketing/ideas/${ideaId}/ad-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, model: "claude-haiku-4-5" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Generation failed");
      const created = {
        ...data.asset,
        createdAt: new Date(data.asset.createdAt).toISOString(),
      } as Asset;
      setAssets((current) => [created, ...current]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function updateStatus(assetId: string, status: AssetStatus) {
    setAssets((current) => current.map((asset) => (asset.id === assetId ? { ...asset, status } : asset)));
    const response = await fetch(`/api/marketing/ad-assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError("Could not update the asset status. Refresh and try again.");
      router.refresh();
    }
  }

  async function copyAsset(asset: Asset) {
    await navigator.clipboard.writeText(assetAsText(asset));
    setCopiedId(asset.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ad assets</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Generate a complete, copy-ready package for the channel you are launching.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => generate("META_AD")} disabled={generating !== null}>
            {generating === "META_AD" ? "Generating Meta…" : "+ Meta package"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => generate("GOOGLE_SEARCH_AD")}
            disabled={generating !== null}
          >
            {generating === "GOOGLE_SEARCH_AD" ? "Generating Google…" : "+ Google Search package"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {assets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center">
            <p className="text-sm font-medium text-gray-800">No ad packages yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Finish the brief, then generate Meta or Google assets from the same customer insight.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                copied={copiedId === asset.id}
                onCopy={() => copyAsset(asset)}
                onStatusChange={(status) => updateStatus(asset.id, status)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssetCard({
  asset,
  copied,
  onCopy,
  onStatusChange,
}: {
  asset: Asset;
  copied: boolean;
  onCopy: () => void;
  onStatusChange: (status: AssetStatus) => void;
}) {
  const content = isRecord(asset.content) ? asset.content : {};
  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">{asset.name}</h3>
            <Badge variant="info">{asset.type === "META_AD" ? "Meta" : "Google Search"}</Badge>
            <Badge variant={STATUS_VARIANTS[asset.status]}>{STATUS_LABELS[asset.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Generated {new Date(asset.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={asset.status}
            onChange={(event) => onStatusChange(event.target.value as AssetStatus)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
            aria-label={`Status for ${asset.name}`}
          >
            {(Object.keys(STATUS_LABELS) as AssetStatus[]).map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
          <Button type="button" size="sm" variant="ghost" onClick={onCopy}>
            {copied ? "Copied" : "Copy all"}
          </Button>
        </div>
      </div>
      <div className="p-4">
        {asset.type === "META_AD" ? <MetaPack content={content} /> : <GooglePack content={content} />}
      </div>
    </article>
  );
}

function MetaPack({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <CopyField label="Concept" value={text(content.concept)} />
        <CopyField label="Hook" value={text(content.hook)} />
        <CopyField label="Primary text" value={text(content.primaryText)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyField label="Headline" value={text(content.headline)} />
          <CopyField label="Description" value={text(content.description)} />
        </div>
        <CopyField label="CTA" value={text(content.cta)} />
      </div>
      <div className="space-y-4">
        <CopyField label="Video script" value={text(content.script)} />
        <ListField label="Shot list" values={strings(content.shotList)} />
      </div>
    </div>
  );
}

function GooglePack({ content }: { content: Record<string, unknown> }) {
  const sitelinks = Array.isArray(content.sitelinks)
    ? content.sitelinks.filter(isRecord)
    : [];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <CopyField label="Campaign theme" value={text(content.campaignTheme)} />
        <CharacterList label="Headlines" values={strings(content.headlines)} limit={30} />
        <CharacterList label="Descriptions" values={strings(content.descriptions)} limit={90} />
      </div>
      <div className="space-y-4">
        <ListField label="Keyword themes" values={strings(content.keywordThemes)} />
        <CharacterList label="Callouts" values={strings(content.callouts)} limit={25} />
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">Sitelinks</p>
          <div className="space-y-2">
            {sitelinks.map((item, index) => (
              <div key={`${text(item.text)}-${index}`} className="rounded-lg border border-gray-200 p-3 text-sm">
                <p className="font-medium text-gray-900">{text(item.text)}</p>
                <p className="text-xs text-gray-600">{text(item.description1)}</p>
                <p className="text-xs text-gray-600">{text(item.description2)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-800">{value || "—"}</p>
    </div>
  );
}

function ListField({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <ul className="space-y-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">
        {values.map((value, index) => <li key={`${value}-${index}`}>{index + 1}. {value}</li>)}
      </ul>
    </div>
  );
}

function CharacterList({ label, values, limit }: { label: string; values: string[]; limit: number }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="space-y-1.5">
        {values.map((value, index) => (
          <div key={`${value}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <span className="text-gray-800">{value}</span>
            <span className={value.length > limit ? "text-red-600" : "text-gray-400"}>{value.length}/{limit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
