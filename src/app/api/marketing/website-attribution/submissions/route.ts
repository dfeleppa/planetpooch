import { randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NewClientLedgerRequest } from "@/lib/marketing/new-client-submissions";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 30_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function authorized(request: Request) {
  const secret = process.env.NEW_CLIENT_LEDGER_SECRET;
  const value = request.headers.get("authorization");
  if (!secret || !value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!authorized(request)) return reply({ error: "Unauthorized" }, 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON required" }, 415);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return reply({ error: "Body too large" }, 413);

  let data;
  try { data = NewClientLedgerRequest.parse(JSON.parse(raw)); }
  catch { return reply({ error: "Invalid ledger payload" }, 400); }

  try {
    if (data.action === "received") {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "WebsiteFormSubmission"
            ("id", "company", "formKey", "receivedAt", "payload", "requestMetadata", "attemptCount", "updatedAt")
          VALUES (${data.submissionId}::uuid, 'RESORT'::"Company", ${data.formKey},
            ${data.receivedAt ? new Date(data.receivedAt) : new Date()}, ${JSON.stringify(data.payload)}::jsonb,
            ${JSON.stringify(data.requestMetadata)}::jsonb, 1, NOW())
          ON CONFLICT ("id") DO UPDATE SET
            "payload" = EXCLUDED."payload", "requestMetadata" = EXCLUDED."requestMetadata",
            "attemptCount" = "WebsiteFormSubmission"."attemptCount" + 1, "updatedAt" = NOW()`;
        await tx.websiteFormSubmissionEvent.create({ data: {
          id: randomUUID(), submissionId: data.submissionId, eventType: "ATTEMPT_RECEIVED",
          status: "RECEIVED", metadata: json({ payload: data.payload, requestMetadata: data.requestMetadata }),
        } });
      });
      return reply({ saved: true, submissionId: data.submissionId }, 201);
    }

    const normalized = data.normalized;
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.websiteFormSubmission.updateMany({
        where: { id: data.submissionId },
        data: {
          status: data.status, lastHttpStatus: data.httpStatus ?? null, lastError: data.message ?? null,
          ...(normalized ? {
            firstName: normalized.firstName, lastName: normalized.lastName, phone: normalized.phone,
            email: normalized.email, pets: normalized.pets === undefined ? undefined : json(normalized.pets), services: normalized.services,
            marketingConsent: normalized.marketingConsent, attribution: normalized.attribution === undefined ? undefined : json(normalized.attribution),
          } : {}),
          ...(data.moegoLeadId !== undefined ? { moegoLeadId: data.moegoLeadId } : {}),
          ...(data.moegoCustomerId !== undefined ? { moegoCustomerId: data.moegoCustomerId } : {}),
          ...(data.moegoPetId !== undefined ? { moegoPetId: data.moegoPetId } : {}),
          ...(data.status === "SYNCED" ? { moegoSyncedAt: new Date() } : {}),
        },
      });
      if (!updated.count) return false;
      await tx.websiteFormSubmissionEvent.create({ data: {
        id: randomUUID(), submissionId: data.submissionId, eventType: "STATUS_CHANGED",
        status: data.status, httpStatus: data.httpStatus ?? null, message: data.message ?? null,
        metadata: json(data.metadata),
      } });
      return true;
    });
    return result ? reply({ saved: true }, 200) : reply({ error: "Submission not found" }, 404);
  } catch (error) {
    console.error("New client ledger persistence failed", error instanceof Error ? error.message : "unknown error");
    return reply({ error: "Ledger unavailable" }, 503);
  }
}
