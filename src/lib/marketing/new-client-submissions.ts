import { z } from "zod";

const jsonRecord = z.record(z.string(), z.unknown());
const optionalText = z.string().trim().max(500).nullable().optional();

export const NewClientSubmissionStatus = z.enum([
  "RECEIVED", "VALIDATED", "VALIDATION_FAILED", "SPAM_REJECTED",
  "CONFIGURATION_FAILED", "RATE_LIMITED", "MOEGO_LOOKUP_STARTED",
  "MOEGO_DUPLICATE_CONFLICT", "MOEGO_CREATE_STARTED", "MOEGO_LEAD_CREATED",
  "MOEGO_NOTE_SAVED", "SYNCED", "MOEGO_FAILED",
]);

const normalized = z.object({
  firstName: optionalText, lastName: optionalText, phone: optionalText,
  email: optionalText, pets: z.array(z.unknown()).max(10).optional(),
  services: z.array(z.string().max(100)).max(10).optional(),
  marketingConsent: z.boolean().nullable().optional(), attribution: jsonRecord.optional(),
}).strict();

export const NewClientLedgerRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("received"), submissionId: z.uuid(), formKey: z.literal("new-client-v1"),
    payload: jsonRecord, requestMetadata: jsonRecord.default({}),
  }).strict(),
  z.object({
    action: z.literal("status"), submissionId: z.uuid(),
    status: NewClientSubmissionStatus, httpStatus: z.number().int().min(100).max(599).nullable().optional(),
    message: z.string().trim().max(2000).nullable().optional(), metadata: jsonRecord.default({}),
    normalized: normalized.optional(), moegoLeadId: optionalText,
    moegoCustomerId: optionalText, moegoPetId: optionalText,
  }).strict(),
]);

export type WebsiteFormSubmissionRow = {
  id: string; receivedAt: Date; updatedAt: Date; payload: Record<string, unknown>;
  requestMetadata: Record<string, unknown>; firstName: string | null; lastName: string | null;
  phone: string | null; email: string | null; pets: unknown[]; services: string[];
  marketingConsent: boolean | null; attribution: Record<string, string>; status: string;
  lastHttpStatus: number | null; lastError: string | null; moegoLeadId: string | null;
  moegoSyncedAt: Date | null; attemptCount: number; events: {
    id: string; createdAt: Date; eventType: string; status: string; httpStatus: number | null;
    message: string | null; metadata: Record<string, unknown>;
  }[];
};
