/**
 * Route Handler conventions for future endpoints.
 *
 * Intended shape of every future handler:
 *
 * ```text
 * request
 *     ↓
 * input parsing (server/shared/validation.ts)
 *     ↓
 * authentication/authorization (Phase 3+)
 *     ↓
 * service (server/<domain>/, receives validated data)
 *     ↓
 * response (ok / created / noContent)
 * ```
 *
 * Rules this module enforces:
 *
 * - Handlers stay thin: no business workflows inside route files.
 * - Every thrown value becomes the `{ error: { code, message } }`
 *   contract; unknown failures are logged server-side (redacted) and
 *   returned as sanitized `INTERNAL_ERROR`.
 * - Database/server work uses the Node.js runtime (see health route).
 *
 * Server Components must NOT fetch these handlers over HTTP for reads.
 * Internal server reads call services directly:
 *
 * ```text
 * Server Component → server service → Mongoose → MongoDB   (preferred)
 * Client Component → Route Handler → server service → ...  (mutations/HTTP)
 * ```
 */

import "server-only";
import { NextResponse } from "next/server";
import {
  ApiError,
  toErrorResponse,
} from "@/lib/api-error";
import { logger } from "@/server/shared/logger";

export function ok<T>(data: T, status = 200): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T): NextResponse<{ data: T }> {
  return ok(data, 201);
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

type RouteHandler = () => Promise<NextResponse> | NextResponse;

/**
 * Execute a Route Handler body with contract-safe error translation.
 * Unknown errors are logged (redacted) server-side and never leak.
 */
export async function handleRoute(handler: RouteHandler): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      // Observability without leakage: the redacting logger scrubs
      // credentials, tokens, and cookies from these details, while the
      // client still receives only the sanitized INTERNAL_ERROR below.
      const details: Record<string, unknown> = {
        name: error instanceof Error ? error.name : typeof error,
      };
      if (error instanceof Error && error.message) {
        details.message = error.message;
      }
      if (
        process.env.NODE_ENV !== "production" &&
        error instanceof Error &&
        error.stack
      ) {
        details.stack = error.stack;
      }
      logger.error("Unhandled route handler error", details);
    }
    return toErrorResponse(error);
  }
}
