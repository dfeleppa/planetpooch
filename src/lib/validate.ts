import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * Parse + validate a JSON request body against a Zod schema.
 *
 * Returns a discriminated result: `{ ok: true, data }` when valid, or
 * `{ ok: false, response }` where `response` is a pre-built 400 NextResponse
 * with a flattened field-error object the client can render.
 *
 * Usage in a route handler:
 * ```ts
 *   const parsed = await validateBody(req, CreateThingSchema);
 *   if (!parsed.ok) return parsed.response;
 *   const { title, order } = parsed.data;
 * ```
 */
export async function validateBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // Zod 4: `flatten()` gives { formErrors, fieldErrors } — the second is what
    // forms usually want for per-field messages.
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Validation failed",
          fieldErrors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Validate an arbitrary value against a schema (e.g., URL search params).
 * Same return shape as validateBody. Use when the input isn't a request body.
 */
export function validateValue<T>(
  value: unknown,
  schema: ZodType<T>
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Validation failed",
          fieldErrors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: result.data };
}
