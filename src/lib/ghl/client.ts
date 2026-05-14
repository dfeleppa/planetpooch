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
  meta: {
    total: number;
    nextPageUrl: string;
    startAfter: number;
    startAfterId: string;
  };
  opportunities: GhlOpportunity[];
};

export async function fetchAllOpportunities(): Promise<GhlOpportunity[]> {
  const { locationId } = getGhlConfig();
  const all: GhlOpportunity[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;
  let pages = 0;

  while (pages < 100) {
    const params: Record<string, string> = { location_id: locationId };
    if (startAfter && startAfterId) {
      params.startAfter = startAfter;
      params.startAfterId = startAfterId;
    }

    const res = await ghlGet<OpportunitySearchResponse>(
      "/opportunities/search",
      params
    );

    all.push(...res.opportunities);
    pages++;

    if (!res.meta.nextPageUrl || res.opportunities.length === 0) break;
    startAfter = String(res.meta.startAfter);
    startAfterId = res.meta.startAfterId;
  }

  return all;
}
