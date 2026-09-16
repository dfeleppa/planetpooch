import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  WebsiteAttributionSchema, cleanAttributionLandingPage, cleanAttributionReferrer,
  isAttributionOriginAllowed,
} from "@/lib/marketing/website-attribution";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 8192;

function cors(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAttributionOriginAllowed(origin, process.env.NODE_ENV === "development")) return null;
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

export function OPTIONS(request: Request) {
  const headers = cors(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? { "Cache-Control": "no-store" } });
}

async function readBody(request: Request) {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
  const headers = cors(request);
  if (!headers) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ error: "JSON required" }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return reply({ error: "Body too large" }, 413);

  let data;
  let landingPage: string;
  let referrerOrigin: string;
  try {
    data = WebsiteAttributionSchema.parse(await readBody(request));
    landingPage = cleanAttributionLandingPage(data.landing_page, process.env.NODE_ENV === "development");
    // A permitted website cannot write attribution for a different origin.
    if (new URL(landingPage).origin !== request.headers.get("origin")) return reply({ error: "Origin mismatch" }, 400);
    referrerOrigin = cleanAttributionReferrer(data.referrer_origin);
  } catch {
    return reply({ error: "Invalid attribution payload" }, 400);
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return reply({ error: "Capture unavailable" }, 503);
  // Vercel overwrites this header. Never trust a caller-supplied x-forwarded-for
  // as a production rate-limit identity. Local development uses one shared bucket.
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local";
  if (!ip) return reply({ error: "Capture unavailable" }, 503);
  const minute = new Date(Math.floor(Date.now() / 60000) * 60000);
  const requestKey = createHmac("sha256", secret).update(`${minute.toISOString()}:${ip}`).digest("hex");

  try {
    const accepted = await prisma.$transaction(async (tx) => {
      // An atomic database counter works across concurrent serverless instances.
      const buckets = await tx.$queryRaw<{ count: number }[]>`
        INSERT INTO "WebsiteAttributionRateBucket" ("key", "minute", "count")
        VALUES (${requestKey}, ${minute}, 1)
        ON CONFLICT ("key") DO UPDATE SET "count" = "WebsiteAttributionRateBucket"."count" + 1
        RETURNING "count"`;
      if (buckets[0].count > 60) return false;
      await tx.$executeRaw`
        INSERT INTO "WebsiteAttributionVisit"
          ("id", "visitorId", "company", "landingPage", "referrerOrigin", "campaign", "clickIds")
        VALUES (${data.event_id}, ${data.visitor_id}, 'RESORT', ${landingPage}, ${referrerOrigin},
          ${JSON.stringify(data.campaign)}::jsonb, ${JSON.stringify(data.click_ids)}::jsonb)
        ON CONFLICT ("id") DO NOTHING`;
      // Rate-limit identifiers are transient; raw IP addresses are never stored.
      await tx.$executeRaw`DELETE FROM "WebsiteAttributionRateBucket" WHERE "minute" < NOW() - INTERVAL '1 day'`;
      return true;
    });
    if (!accepted) return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    return reply({ accepted: true }, 202);
  } catch {
    // Do not log payloads containing marketing identifiers.
    console.error("Website attribution persistence failed");
    return reply({ error: "Capture unavailable" }, 503);
  }
}
