export type LeadAttributionSource = "meta" | "google-ads" | "google-lsa" | "unattributed";

export type SubmissionAttribution = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function classifyLeadAttribution(attribution: SubmissionAttribution): LeadAttributionSource {
  const source = text(attribution.utm_source).toLowerCase();
  const medium = text(attribution.utm_medium).toLowerCase();
  const campaign = text(attribution.utm_campaign).toLowerCase();
  const combined = `${source} ${medium} ${campaign}`;

  if (/\b(lsa|local[ _-]?services?)\b/.test(combined)) return "google-lsa";
  if (
    text(attribution.fbclid) ||
    ["fb", "facebook", "meta", "instagram", "ig"].includes(source)
  ) return "meta";
  if (
    text(attribution.gclid) || text(attribution.gbraid) || text(attribution.wbraid) ||
    source === "google" || source === "google-ads" || source === "google_ads"
  ) return "google-ads";

  return "unattributed";
}

export function attributionText(attribution: SubmissionAttribution, key: string): string | null {
  return text(attribution[key]) || null;
}
