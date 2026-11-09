import { getGoogleAdsAuthClient } from "@/lib/google";

/** Read-only Google Ads queries, including every result page. */
export async function googleAdsQuery<T>(query: string, customerId: string, version = "v26"): Promise<T[]> {
  if (!/^\d{10}$/.test(customerId)) throw new Error("Configure a valid Google Ads customer ID for LSA.");
  const client = getGoogleAdsAuthClient();
  if (!client) throw new Error("Google Ads workload identity is not configured.");
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error("Could not obtain a Google Ads access token.");
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  const results: T[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const response = await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        ...(login ? { "login-customer-id": login } : {}),
        ...(process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? { "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN } : {}) },
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    });
    const body = await response.json() as { results?: T[]; nextPageToken?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? `Google LSA request failed (${response.status}).`);
    results.push(...body.results ?? []);
    pageToken = body.nextPageToken || undefined;
    if (pageToken && seen.has(pageToken)) throw new Error("Google LSA returned a repeated page; previous data has been preserved.");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return results;
}
