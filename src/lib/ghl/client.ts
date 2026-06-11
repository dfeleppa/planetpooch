const BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

export class GhlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhlConfigError";
  }
}

export class GhlApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "GhlApiError";
  }
}

export function getGhlConfig(): { apiKey: string; locationId: string } {
  const apiKey = process.env.GHL_INTEGRATION;
  if (!apiKey) {
    throw new GhlConfigError(
      "GHL_INTEGRATION is not set. Add the sub-account API key to your environment."
    );
  }
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) {
    throw new GhlConfigError(
      "GHL_LOCATION_ID is not set. Add the sub-account location ID to your environment."
    );
  }
  return { apiKey, locationId };
}

export async function ghlGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const { apiKey } = getGhlConfig();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: API_VERSION,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let message = `GHL API ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body === "object" && body !== null) {
        const msg =
          (body as Record<string, unknown>).message ??
          (body as Record<string, unknown>).error ??
          (body as Record<string, unknown>).msg;
        if (msg) message = String(msg);
      }
    } catch {
      // body wasn't JSON
    }
    throw new GhlApiError(message, res.status);
  }

  return (await res.json()) as T;
}

export type GhlOpportunity = {
  id: string;
  name: string;
  status: string;
  source: string;
  monetaryValue: number;
  createdAt: string;
  attributions: {
    adSource?: string;
    utmCampaign?: string;
    utmCampaignId?: string;
    utmContent?: string;
    utmMedium?: string;
    utmSessionSource?: string;
    utmSource?: string;
    utmAdId?: string;
    mediumId?: string;
    isFirst?: boolean;
    isLast?: boolean;
  }[];
};

type OpportunitySearchResponse = {
  meta?: {
    total?: number;
    nextPageUrl?: string | null;
    startAfter?: number | string | null;
    startAfterId?: string | null;
  };
  opportunities?: unknown[];
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanNumber(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(n) ? n : 0;
}

function cleanAttributions(value: unknown): GhlOpportunity["attributions"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const raw = item as Record<string, unknown>;
    return {
      adSource: cleanString(raw.adSource) || undefined,
      utmCampaign: cleanString(raw.utmCampaign) || undefined,
      utmCampaignId: cleanString(raw.utmCampaignId) || undefined,
      utmContent: cleanString(raw.utmContent) || undefined,
      utmMedium: cleanString(raw.utmMedium) || undefined,
      utmSessionSource: cleanString(raw.utmSessionSource) || undefined,
      utmSource: cleanString(raw.utmSource) || undefined,
      utmAdId: cleanString(raw.utmAdId) || undefined,
      mediumId: cleanString(raw.mediumId) || undefined,
      isFirst: typeof raw.isFirst === "boolean" ? raw.isFirst : undefined,
      isLast: typeof raw.isLast === "boolean" ? raw.isLast : undefined,
    };
  });
}

function cleanOpportunity(value: unknown): GhlOpportunity | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = cleanString(raw.id);
  if (!id) return null;

  return {
    id,
    name: cleanString(raw.name),
    status: cleanString(raw.status),
    source: cleanString(raw.source),
    monetaryValue: cleanNumber(raw.monetaryValue),
    createdAt: cleanString(raw.createdAt),
    attributions: cleanAttributions(raw.attributions),
  };
}

export async function fetchAllOpportunities(): Promise<GhlOpportunity[]> {
  const { locationId } = getGhlConfig();
  const all: GhlOpportunity[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;
  let pages = 0;

  while (pages < 500) {
    const params: Record<string, string> = {
      location_id: locationId,
      limit: "100",
    };
    if (startAfter && startAfterId) {
      params.startAfter = startAfter;
      params.startAfterId = startAfterId;
    }

    const res = await ghlGet<OpportunitySearchResponse>(
      "/opportunities/search",
      params
    );

    const opportunities = (res.opportunities ?? []).flatMap((o) => {
      const opportunity = cleanOpportunity(o);
      return opportunity ? [opportunity] : [];
    });
    all.push(...opportunities);
    pages++;

    if (!res.meta?.nextPageUrl || opportunities.length === 0) break;
    startAfter =
      res.meta.startAfter === null || res.meta.startAfter === undefined
        ? undefined
        : String(res.meta.startAfter);
    startAfterId = res.meta.startAfterId ?? undefined;
    if (!startAfter || !startAfterId) break;
  }

  return all;
}
