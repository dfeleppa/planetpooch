import { z } from "zod";

export const WEBSITE_ORIGINS = ["https://www.planet-pooch.com", "https://planet-pooch.com"];
const text = z.string().trim().max(500);
const campaign = z.object({
  utm_source: text.optional(), utm_medium: text.optional(), utm_campaign: text.optional(),
  utm_term: text.optional(), utm_content: text.optional(), utm_id: text.optional(),
  utm_source_platform: text.optional(), utm_creative_format: text.optional(), utm_marketing_tactic: text.optional(),
}).strict();
const clickIds = z.object({
  gclid: text.optional(), gbraid: text.optional(), wbraid: text.optional(), dclid: text.optional(),
  fbclid: text.optional(), msclkid: text.optional(), ttclid: text.optional(),
}).strict();

export function isAttributionOriginAllowed(origin: string | null, development = false) {
  if (!origin) return false;
  if (WEBSITE_ORIGINS.includes(origin)) return true;
  if (!development) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch { return false; }
}

export const WebsiteAttributionSchema = z.object({
  event_id: z.uuid(),
  visitor_id: z.uuid(),
  landing_page: z.url().max(2000),
  referrer_origin: z.union([z.literal(""), z.url().max(500)]),
  campaign,
  click_ids: clickIds,
}).strict();

export function cleanAttributionLandingPage(value: string, development = false) {
  const url = new URL(value);
  if (!isAttributionOriginAllowed(url.origin, development) || url.pathname.replace(/\/$/, "") !== "/get-started") {
    throw new Error("Unsupported landing page");
  }
  return url.origin + url.pathname;
}

export function cleanAttributionReferrer(value: string) {
  if (!value) return "";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) return "";
  return url.origin;
}

export type WebsiteAttributionVisit = {
  id: string;
  visitorId: string;
  createdAt: Date;
  landingPage: string;
  referrerOrigin: string;
  campaign: Record<string, string>;
  clickIds: Record<string, string>;
};
