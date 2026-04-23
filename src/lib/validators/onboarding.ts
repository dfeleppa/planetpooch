import { z } from "zod";

/**
 * Onboarding template + task schemas for Phase 2.
 *
 * Task `type` is a discriminated union — each type permits a different set of
 * optional fields, so the schema only validates the fields that make sense for
 * that type. Add new task types here when extending.
 */

export const OnboardingTaskTypeSchema = z.enum([
  "ESIGN_REQUEST",
  "EMPLOYEE_CONFIRM",
  "ADMIN_FILE_UPLOAD",
  "ADMIN_TASK",
]);
export type OnboardingTaskTypeInput = z.infer<typeof OnboardingTaskTypeSchema>;

// ── Template CRUD ──────────────────────────────────────────────────────────

export const CreateTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).default(""),
  isActive: z.boolean().default(true),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

// ── Template task CRUD ─────────────────────────────────────────────────────

/**
 * Create a task inside a template. The discriminated union lets us demand
 * `handbookFileName` only on ESIGN tasks and `externalUrl` only on ADMIN_TASKs.
 */
export const CreateTemplateTaskSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ESIGN_REQUEST"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    required: z.boolean().default(true),
    handbookFileName: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal("EMPLOYEE_CONFIRM"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    required: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("ADMIN_FILE_UPLOAD"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    required: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("ADMIN_TASK"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    required: z.boolean().default(true),
    externalUrl: z.string().url().optional().nullable(),
  }),
]);

// PATCH payloads — every field optional, but we still validate type on the ones
// present. Keep it permissive: admins may edit just a title, just an order, etc.
export const UpdateTemplateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  required: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
  handbookFileName: z.string().trim().max(200).nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
});

// Reorder endpoint — client sends the full new order of task IDs.
export const ReorderTasksSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
});
