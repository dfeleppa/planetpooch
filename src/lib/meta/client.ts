/**
 * Thin wrapper around the Meta Graph API. We use a System User access token
 * (long-lived, owned by the Business Manager that owns the ad account) — no
 * per-user OAuth, no app review required since it's first-party data.
 *
 * Token + ad account come from env vars. Both are required; we fail loudly
 * if either is missing rather than silently returning empty data.
 */

const API_VERSION = process.env.META_API_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export class MetaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaConfigError";
  }
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fbCode?: number,
    public fbType?: string
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export function getMetaConfig(): { token: string; adAccountId: string } {
  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!token) {
    throw new MetaConfigError(
      "META_ACCESS_TOKEN is not set. Add the System User token to your environment."
    );
  }
  if (!adAccountId) {
    throw new MetaConfigError(
      "META_AD_ACCOUNT_ID is not set. Add the ad account id (format: act_1234567890)."
    );
  }
  if (!adAccountId.startsWith("act_")) {
    throw new MetaConfigError(
      `META_AD_ACCOUNT_ID must start with "act_" — got "${adAccountId}".`
    );
  }
  return { token, adAccountId };
}

/**
 * Low-level GET. Caller passes a path (e.g. `/me/adaccounts`) plus query
 * params. Token is appended automatically.
 */
async function graphGet<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const { token } = getMetaConfig();
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    let fbCode: number | undefined;
    let fbType: string | undefined;
    let message = `Meta API ${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: { message?: string; code?: number; type?: string };
      };
      if (body.error) {
        message = body.error.message ?? message;
        fbCode = body.error.code;
        fbType = body.error.type;
      }
    } catch {
      // body wasn't JSON; keep generic message
    }
    throw new MetaApiError(message, res.status, fbCode, fbType);
  }
  return (await res.json()) as T;
}

/**
 * GET with cursor-based pagination. Walks `paging.next` until exhausted and
 * returns the flattened `data` array. Caps at 50 pages as a safety net.
 */
export async function graphGetPaginated<T>(
  path: string,
  params: Record<string, string>
): Promise<T[]> {
  const { token } = getMetaConfig();
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const out: T[] = [];
  let next: string | undefined = url.toString();
  let pages = 0;
  while (next && pages < 50) {
    const res: Response = await fetch(next, { cache: "no-store" });
    if (!res.ok) {
      let message = `Meta API ${res.status}`;
      let fbCode: number | undefined;
      let fbType: string | undefined;
      try {
        const body = (await res.json()) as {
          error?: { message?: string; code?: number; type?: string };
        };
        if (body.error) {
          message = body.error.message ?? message;
          fbCode = body.error.code;
          fbType = body.error.type;
        }
      } catch {
        // ignore
      }
      throw new MetaApiError(message, res.status, fbCode, fbType);
    }
    const body = (await res.json()) as {
      data: T[];
      paging?: { next?: string };
    };
    out.push(...body.data);
    next = body.paging?.next;
    pages += 1;
  }
  return out;
}

export type AdAccountInfo = {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
};

/**
 * Connection probe. Returns the configured ad account's name/currency/tz so
 * the UI can confirm "yes, we're talking to the right account."
 */
export async function fetchAdAccountInfo(): Promise<AdAccountInfo> {
  const { adAccountId } = getMetaConfig();
  return graphGet<AdAccountInfo>(`/${adAccountId}`, {
    fields: "id,name,currency,timezone_name",
  });
}
