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
const PAGE_SIZE = 500;
/**
 * Sleep between paginated pages of the SAME resource. MoeGo doesn't
 * publish rate limits; their own example script uses 1s, but that's
 * conservative — 100ms holds well under any sane public-API ceiling
 * and keeps long backfills inside the function timeout.
 */
const SLEEP_MS = 100;

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
    // Prefix with the path so a generic "unauthorized" tells us which
    // endpoint MoeGo rejected (e.g. leads might be a separate add-on
    // that the API key isn't scoped to).
    throw new MoegoApiError(`${path}: ${message}`, res.status);
  }

  return (await res.json()) as T;
}

type PaginatedResponse<TKey extends string, TRow> = {
  nextPageToken?: string;
} & { [K in TKey]: TRow[] };

/**
 * Stream pages from a MoeGo `:list` endpoint. Each yielded array is one
 * page (≤PAGE_SIZE rows). The caller persists each page as it arrives,
 * so a busy 30-day slice doesn't have to fit thousands of rows in
 * memory before any DB write happens — and we can interleave the time-
 * budget check between pages instead of just between slices.
 *
 * MoeGo list endpoints require `companyId` at the top of the body and
 * put per-resource filters under `filter`. Some endpoints (orders,
 * leads) additionally require a non-empty `businessIds` array via
 * `extraTop`. `rowKey` is the field the API returns rows under (e.g.
 * "customers", "orders").
 */
export async function* listPages<TKey extends string, TRow>(
  path: string,
  rowKey: TKey,
  filter: Record<string, unknown> = {},
  extraTop: Record<string, unknown> = {}
): AsyncGenerator<TRow[]> {
  const { companyId } = getMoegoConfig();
  let pageToken = "1";
  let pages = 0;

  while (pages < 1000) {
    const body = {
      companyId,
      ...extraTop,
      filter,
      pagination: { pageSize: PAGE_SIZE, pageToken },
    };
    const res = await moegoPost<PaginatedResponse<TKey, TRow>>(path, body);
    const rows = res[rowKey] ?? [];
    yield rows;
    pages++;

    if (!res.nextPageToken || rows.length === 0) break;
    pageToken = res.nextPageToken;
    await sleep(SLEEP_MS);
  }
}

export type MoegoCompany = {
  id: string;
  name?: string;
  country?: string;
  timezone?: { id?: string };
};

export type MoegoBusiness = {
  id: string;
  name?: string;
  companyId?: string;
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

/**
 * List every business under the configured company. Required because
 * /v1/orders:list and /v1/leads:list reject requests with an empty
 * businessIds array — auto-discovering the set means we don't need a
 * separate env var, and new businesses are picked up automatically.
 */
export async function listBusinesses(): Promise<MoegoBusiness[]> {
  const { companyId } = getMoegoConfig();
  const all: MoegoBusiness[] = [];
  let pageToken = "1";
  let pages = 0;

  while (pages < 50) {
    const res = await moegoPost<PaginatedResponse<"businesses", MoegoBusiness>>(
      "/businesses:list",
      {
        companyId,
        pagination: { pageSize: PAGE_SIZE, pageToken },
      }
    );
    all.push(...(res.businesses ?? []));
    pages++;
    if (!res.nextPageToken || (res.businesses ?? []).length === 0) break;
    pageToken = res.nextPageToken;
    await sleep(SLEEP_MS);
  }
  return all;
}

// ---------- Resource types we project into Postgres ----------

/**
 * MoeGo money values follow the google.type.Money proto, which JSON-
 * serializes as `{ currencyCode, units, nanos }`. We store integer
 * cents, so we accept either the Money object or a legacy string/number
 * shape for forward-compat with any other shape MoeGo might use.
 */
export type MoegoMoney =
  | { currencyCode?: string; units?: string | number; nanos?: number }
  | string
  | number
  | null
  | undefined;

/**
 * `referralSource` is typed as MoeGo's `ReferralSource` enum/struct.
 * In practice it serializes as either a plain string ("Instagram") or
 * an object that carries a display label (e.g. `{ name: "Instagram",
 * id: "..." }`). Normalize both via `readReferralSource()`.
 */
export type MoegoReferralSource =
  | string
  | { name?: string; value?: string; label?: string; id?: string }
  | null
  | undefined;

export type MoegoCustomerTag = string | { name?: string; label?: string };

export type MoegoCustomerRow = {
  id: string;
  /// MoeGo splits the name into `firstName` + `lastName` — there is no
  /// composite `name` field. We accept an optional top-level `name` too
  /// in case a future API revision exposes one.
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  mainPhoneNumber?: string;
  /// Legacy/alternate field name MoeGo uses in some places (the
  /// CreateCustomer request body uses `phone`, the list response uses
  /// `mainPhoneNumber`).
  phone?: string;
  /// Primary lead-source signal on the customer object.
  referralSource?: MoegoReferralSource;
  /// Secondary lead-source signal (plain string).
  source?: string;
  preferredBusinessId?: string;
  lastAppointmentDate?: string;
  nextAppointmentDate?: string;
  upcomingAppointmentsUrl?: string;
  tags?: MoegoCustomerTag[];
  createdTime: string; // ISO 8601
  lastUpdatedTime?: string;
  customFields?: Record<string, unknown>;
};

export type MoegoOrderRow = {
  id: string;
  customerId?: string;
  businessId?: string;
  status?: string;
  subTotalAmount?: MoegoMoney;
  totalAmount?: MoegoMoney;
  paidAmount?: MoegoMoney;
  refundedAmount?: MoegoMoney;
  taxAmount?: MoegoMoney;
  discountAmount?: MoegoMoney;
  tipsAmount?: MoegoMoney;
  extraFeeAmount?: MoegoMoney;
  createdTime: string;
  lastUpdatedTime?: string;
  salesDatetime?: string;
  completedTime?: string;
};

export type MoegoAppointmentServiceDetail = {
  id?: string;
  name?: string;
  price?: MoegoMoney;
  serviceItemType?: string;
  serviceType?: string;
  category?: string;
};

export type MoegoAppointmentPetServiceDetail = {
  pet?: {
    id?: string;
    name?: string;
  };
  serviceDetails?: MoegoAppointmentServiceDetail[];
  evaluationDetails?: {
    id?: string;
    name?: string;
    status?: string;
  }[];
};

export type MoegoAppointmentRow = {
  id: string;
  businessId?: string;
  customerId?: string;
  orderId?: string;
  status?: string;
  totalAmount?: MoegoMoney;
  paidAmount?: MoegoMoney;
  refundAmount?: MoegoMoney;
  duration?: {
    startTime?: string;
    endTime?: string;
  };
  petServiceDetails?: MoegoAppointmentPetServiceDetail[];
  createdTime?: string;
  lastUpdatedTime?: string;
  checkInTime?: string;
  checkOutTime?: string;
};

export type MoegoLeadRow = {
  id: string;
  name?: string;
  mainPhoneNumber?: string;
  referralSource?: MoegoReferralSource;
  lifeCycleId?: string;
  actionStatusId?: string;
  createdTime: string;
  lastUpdatedTime?: string;
};

/**
 * Coerce MoeGo's `ReferralSource` (string or labelled object) down to
 * a single display string. Returns null when nothing usable is set.
 */
export function readReferralSource(rs: MoegoReferralSource): string | null {
  if (rs == null) return null;
  if (typeof rs === "string") return rs.trim() || null;
  const candidate = rs.name ?? rs.label ?? rs.value;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return null;
}

/**
 * Coerce a MoeGo tag list (strings or labelled objects) into a clean
 * string[] suitable for the Postgres TEXT[] column.
 */
export function readTags(tags: MoegoCustomerTag[] | undefined): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t === "string") {
      const v = t.trim();
      if (v) out.push(v);
    } else if (t && typeof t === "object") {
      const v = (t.name ?? t.label)?.trim?.();
      if (v) out.push(v);
    }
  }
  return out;
}

/**
 * MoeGo serializes money as a google.type.Money object
 * (`{ currencyCode, units, nanos }`). Units = whole units (dollars);
 * nanos = nanoseconds-of-a-unit (1 unit = 1e9 nanos). We also accept
 * decimal strings/numbers for forward-compat with any other shape that
 * might appear. Missing values → 0.
 */
export function toCents(amount: MoegoMoney): number {
  if (amount == null) return 0;
  if (typeof amount === "number") {
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  }
  if (typeof amount === "string") {
    const n = Number(amount);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  // Money object: units may arrive as a string (Long.toString) or number.
  const unitsRaw = amount.units;
  const units =
    typeof unitsRaw === "string" ? Number(unitsRaw) : (unitsRaw ?? 0);
  const nanos = typeof amount.nanos === "number" ? amount.nanos : 0;
  if (!Number.isFinite(units)) return 0;
  // 1 cent = 1e7 nanos; preserve sign correctly when only one side is set.
  return Math.round(units * 100 + nanos / 1e7);
}

export function streamCustomers(filters: {
  lastUpdatedTime?: { startTime: string; endTime: string };
}): AsyncGenerator<MoegoCustomerRow[]> {
  return listPages<"customers", MoegoCustomerRow>(
    "/customers:list",
    "customers",
    filters
  );
}

export function streamOrders(
  filters: {
    ids?: string[];
    lastUpdatedTime?: { startTime: string; endTime: string };
  },
  businessIds: string[]
): AsyncGenerator<MoegoOrderRow[]> {
  return listPages<"orders", MoegoOrderRow>(
    "/orders:list",
    "orders",
    filters,
    { businessIds }
  );
}

export function streamAppointments(
  filters: {
    startTime?: { startTime: string; endTime: string };
    endTime?: { startTime: string; endTime: string };
    lastUpdatedTime?: { startTime: string; endTime: string };
    statuses?: string[];
    serviceTypes?: string[];
    customerIds?: string[];
  },
  businessIds: string[]
): AsyncGenerator<MoegoAppointmentRow[]> {
  return listPages<"appointments", MoegoAppointmentRow>(
    "/appointments:list",
    "appointments",
    filters,
    { businessIds }
  );
}

export function streamLeads(
  filters: { lastUpdatedTime?: { startTime: string; endTime: string } },
  businessIds: string[]
): AsyncGenerator<MoegoLeadRow[]> {
  return listPages<"leads", MoegoLeadRow>(
    "/leads:list",
    "leads",
    filters,
    { businessIds }
  );
}
