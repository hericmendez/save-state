/**
 * Generic input-validation helpers for future Route Handlers and services.
 *
 * Convention (do not invert it):
 *
 * ```text
 * HTTP/input contract validation (Zod schema, throws ApiError)
 *       ↓
 * domain/service logic (receives already-validated data)
 * ```
 *
 * These helpers are intentionally domain-free. Auth/game/list schemas
 * arrive with their own phases; this module only defines *how* parsing
 * failures become contract errors:
 *
 * - body/param failures → `VALIDATION_ERROR` (400)
 * - query-string failures → `INVALID_QUERY` (400)
 */

import "server-only";
import { z } from "zod";
import { ApiError, type ErrorCode } from "@/lib/api-error";

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path =
        issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseWith<T>(
  schema: z.ZodType<T>,
  data: unknown,
  code: ErrorCode,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(code, formatIssues(parsed.error));
  }
  return parsed.data;
}

/** Validate a request body (or any body-shaped input). */
export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  return parseWith(schema, data, "VALIDATION_ERROR");
}

/** Validate route params. */
export function parseParams<T>(schema: z.ZodType<T>, data: unknown): T {
  return parseWith(schema, data, "VALIDATION_ERROR");
}

/** Validate query-string input. */
export function parseQuery<T>(schema: z.ZodType<T>, data: unknown): T {
  return parseWith(schema, data, "INVALID_QUERY");
}

/**
 * Convert `URLSearchParams` to a plain object for Zod parsing.
 * Schemas expecting numbers/booleans should coerce (for example,
 * `z.coerce.number()`), since every value arrives as a string.
 */
export function searchParamsToObject(
  searchParams: URLSearchParams,
): Record<string, string> {
  return Object.fromEntries(searchParams.entries());
}
