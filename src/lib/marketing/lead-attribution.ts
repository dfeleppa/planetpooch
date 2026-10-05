export type LeadAttributionSource = "meta" | "google-ads" | "google-lsa" | "unattributed";

export type SubmissionAttribution = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clickId(value: unknown): boolean {
  return /^[A-Za-z0-9_-]{6,}$/.test(text(value));
}

export function classifyLeadAttribution(attribution: SubmissionAttribution): LeadAttributionSource {
  const source = text(attribution.utm_source).toLowerCase();
  const medium = text(attribution.utm_medium).toLowerCase();
  const campaign = text(attribution.utm_campaign).toLowerCase();
  const combined = `${source} ${medium} ${campaign}`;

  if (/\b(lsa|local[ _-]?services?)\b/.test(combined)) return "google-lsa";
  if (["fb", "facebook", "meta", "instagram", "ig"].includes(source)) return "meta";
  if (["google", "google-ads", "google_ads"].includes(source)) return "google-ads";
  if (clickId(attribution.gclid) || clickId(attribution.gbraid) || clickId(attribution.wbraid)) return "google-ads";
  if (clickId(attribution.fbclid)) return "meta";

  return "unattributed";
}

export function attributionText(attribution: SubmissionAttribution, key: string): string | null {
  return text(attribution[key]) || null;
}
