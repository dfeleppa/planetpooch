/**
 * Thin wrapper around the MoeGo OpenAPI v1.
 *
 * Auth: MoeGo issues a base64-encoded API key (via Customer Success). It
 * goes directly into `Authorization: Basic <key>` — do NOT re-base64 it.
 *
 * List endpoints follow Google AIP style: POST to `/v1/<resource>:list`
 * with a JSON body that contains filters + pagination. First call uses
 * pageToken "1"; subsequent calls use the response's `nextPageToken`
 * until it's absent.
 *
 * Rate limits aren't documented but MoeGo's own example script sleeps 1s
 * between paginated calls — we mirror that to stay safe.
 */

const BASE_URL = "https://openapi.moego.pet/v1";
const PAGE_SIZE = 100;
const SLEEP_MS = 1000;

export class MoegoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoegoConfigError";
  }
}

export class MoegoApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "MoegoApiError";
  }
}

export function getMoegoConfig(): { apiKey: string; companyId: string } {
  const apiKey = process.env.MOEGO_API_KEY;
  if (!apiKey) {
    throw new MoegoConfigError(
      "MOEGO_API_KEY is not set. Add the base64 API key from MoeGo to your environment."
    );
  }
  const companyId = process.env.MOEGO_COMPANY_ID;
  if (!companyId) {
    throw new MoegoConfigError(
      "MOEGO_COMPANY_ID is not set. Run the company discovery endpoint to find your obfuscated company ID (format: cmp_...)."
    );
  }
  return { apiKey, companyId };
}

/**
 * The auth-only subset of config — used by company discovery, which has
 * to run BEFORE the user has a companyId to set.
 */
export function getMoegoAuth(): { apiKey: string } {
  const apiKey = process.env.MOEGO_API_KEY;
  if (!apiKey) {
    throw new MoegoConfigError(
      "MOEGO_API_KEY is not set. Add the base64 API key from MoeGo to your environment."
    );
  }
  return { apiKey };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function moegoPost<T>(path: string, body: unknown): Promise<T> {
  const { apiKey } = getMoegoAuth();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `MoeGo API ${res.status}`;
    try {
      const payload = await res.json();
      if (typeof payload === "object" && payload !== null) {
        const msg =
          (payload as Record<string, unknown>).message ??
          (payload as Record<string, unknown>).error;
        if (msg) message = String(msg);
      }
    } catch {
      // body wasn't JSON
    }
    throw new MoegoApiError(message, res.status);
  }

  return (await res.json()) as T;
}

type PaginatedResponse<TKey extends string, TRow> = {
  nextPageToken?: string;
} & { [K in TKey]: TRow[] };

/**
 * Page through a `:list` endpoint until exhausted. MoeGo list endpoints
 * require `companyId` at the top of the body and put per-resource filters
 * under a `filter` object. The collection key is the field the API returns
 * rows under (e.g. "customers", "orders").
 */
export async function listAllPages<TKey extends string, TRow>(
  path: string,
  rowKey: TKey,
  filter: Record<string, unknown> = {}
): Promise<TRow[]> {
  const { companyId } = getMoegoConfig();
  const all: TRow[] = [];
  let pageToken = "1";
  let pages = 0;

  while (pages < 1000) {
    const body = {
      companyId,
      filter,
      pagination: { pageSize: PAGE_SIZE, pageToken },
    };
    const res = await moegoPost<PaginatedResponse<TKey, TRow>>(path, body);
    const rows = res[rowKey] ?? [];
    all.push(...rows);
    pages++;

    if (!res.nextPageToken || rows.length === 0) break;
    pageToken = res.nextPageToken;
    await sleep(SLEEP_MS);
  }

  return all;
}

export type MoegoCompany = {
  id: string;
  name?: string;
  country?: string;
  timezone?: { id?: string };
};

/**
 * Discovery: list every company the API key has access to. Unlike the
 * resource :list endpoints, this one doesn't require a companyId — it's
 * the bootstrap step you run once to find the value for MOEGO_COMPANY_ID.
 */
export async function listCompanies(): Promise<MoegoCompany[]> {
  const all: MoegoCompany[] = [];
  let pageToken = "1";
  let pages = 0;

  while (pages < 50) {
    const res = await moegoPost<PaginatedResponse<"companies", MoegoCompany>>(
      "/companies:list",
      { pagination: { pageSize: PAGE_SIZE, pageToken } }
    );
    all.push(...(res.companies ?? []));
    pages++;
    if (!res.nextPageToken || (res.companies ?? []).length === 0) break;
    pageToken = res.nextPageToken;
    await sleep(SLEEP_MS);
  }
  return all;
}

// ---------- Resource types we project into Postgres ----------

export type MoegoCustomerRow = {
  id: string;
  name?: string;
  email?: string;
  mainPhoneNumber?: string;
  createdTime: string; // ISO 8601
  lastUpdatedTime?: string;
  customFields?: Record<string, unknown>;
};

export type MoegoOrderRow = {
  id: string;
  customerId?: string;
  status?: string;
  subTotalAmount?: string | number;
  totalAmount?: string | number;
  paidAmount?: string | number;
  refundedAmount?: string | number;
  createdTime: string;
  lastUpdatedTime?: string;
};

export type MoegoLeadRow = {
  id: string;
  name?: string;
  mainPhoneNumber?: string;
  referralSource?: string;
  lifeCycleId?: string;
  actionStatusId?: string;
  createdTime: string;
  lastUpdatedTime?: string;
};

/**
 * MoeGo returns money as decimal strings ("12.34") in some places and as
 * numbers in others. Normalise to integer cents; missing values → 0.
 */
export function toCents(amount: string | number | undefined | null): number {
  if (amount == null) return 0;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export async function listCustomers(filters: {
  lastUpdatedTime?: { startTime: string; endTime: string };
}): Promise<MoegoCustomerRow[]> {
  return listAllPages<"customers", MoegoCustomerRow>(
    "/customers:list",
    "customers",
    filters
  );
}

export async function listOrders(filters: {
  lastUpdatedTime?: { startTime: string; endTime: string };
}): Promise<MoegoOrderRow[]> {
  return listAllPages<"orders", MoegoOrderRow>(
    "/orders:list",
    "orders",
    filters
  );
}

export async function listLeads(filters: {
  lastUpdatedTime?: { startTime: string; endTime: string };
}): Promise<MoegoLeadRow[]> {
  return listAllPages<"leads", MoegoLeadRow>("/leads:list", "leads", filters);
}
