/**
 * Low-level IGDB Apicalypse client (Etapa 3).
 *
 * - POST https://api.igdb.com/v4/<endpoint> with plain-text Apicalypse body.
 * - Auth: Twitch app token (shared cache) + `Client-ID` header.
 * - 401 → invalidate token + retry once (expiry recovery).
 * - 429 → RATE_LIMIT_EXCEEDED; 5xx/timeout/connection → IGDB_UNAVAILABLE.
 * - 4xx (bad query = our bug) → INTERNAL_ERROR with server-side log.
 * - Throttle: serialized queue, ≥250ms between request starts (4 req/s,
 *   mirroring the ATP Engine server gate). Shared process-wide.
 * - No token or secret ever leaves the server (server-only).
 */

import "server-only";
import { ApiError } from "@/lib/api-error";
import { loadServerEnv } from "@/lib/env";
import { logger } from "@/server/shared/logger";
import {
  getTwitchToken,
  invalidateTwitchToken,
} from "@/server/search/twitch-token";

export const IGDB_BASE_URL = "https://api.igdb.com/v4";
export const IGDB_SEARCH_TIMEOUT_MS = 10_000;
export const IGDB_DETAIL_TIMEOUT_MS = 10_000;
export const IGDB_COVER_TIMEOUT_MS = 15_000;
/** Minimum interval between IGDB request starts (4 req/s shared gate). */
export const IGDB_MIN_INTERVAL_MS = 250;

let queueTail: Promise<void> = Promise.resolve();
let lastStartAt = 0;

async function acquireSlot(): Promise<void> {
  const previous = queueTail;
  let release!: () => void;
  queueTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const wait = IGDB_MIN_INTERVAL_MS - (Date.now() - lastStartAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastStartAt = Date.now();
  release();
}

/** Test-only hook: reset the throttle queue between cases. */
export function __resetIgdbThrottle(): void {
  queueTail = Promise.resolve();
  lastStartAt = 0;
}

/** Escape double quotes for Apicalypse string literals. */
export function escapeApicalypse(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildIgdbImageUrl(
  imageId: string,
  size: "t_cover_big" | "t_logo_med" | "t_thumb",
): string {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

interface IgdbRequestOptions {
  timeoutMs: number;
  route: string;
}

export async function igdbRequest(
  endpoint: string,
  body: string,
  options: IgdbRequestOptions,
  source?: Record<string, string | undefined>,
): Promise<unknown> {
  await acquireSlot();
  const startedAt = Date.now();
  const attempt = async (retried: boolean): Promise<unknown> => {
    const token = await getTwitchToken(source);
    const clientId = loadServerEnv(source).TWITCH_CLIENT_ID?.trim();
    let response: Response;
    try {
      response = await fetch(`${IGDB_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Client-ID": clientId ?? "",
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
          Accept: "application/json",
        },
        body,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timedOut =
        typeof error === "object" &&
        error !== null &&
        (error as { name?: unknown }).name === "TimeoutError";
      logger.error("IGDB request failed", {
        route: options.route,
        latencyMs: Date.now() - startedAt,
        reason: timedOut ? "timeout" : "connection",
      });
      throw new ApiError(
        "IGDB_UNAVAILABLE",
        "The game catalog is temporarily unavailable",
        503,
      );
    }
    if (response.status === 401 && !retried) {
      // Token may have expired between cache check and use.
      invalidateTwitchToken();
      logger.warn("IGDB unauthorized, refreshing token and retrying", {
        route: options.route,
      });
      return attempt(true);
    }
    if (response.status === 401 || response.status === 403) {
      logger.warn("IGDB credentials rejected", {
        route: options.route,
        status: response.status,
      });
      throw new ApiError(
        "INTERNAL_ERROR",
        "IGDB integration is not configured (invalid Twitch credentials)",
        500,
      );
    }
    if (response.status === 429) {
      logger.warn("IGDB rate limited", { route: options.route });
      throw new ApiError(
        "RATE_LIMIT_EXCEEDED",
        "Too many requests, try again later",
        429,
      );
    }
    if (response.status >= 500) {
      logger.warn("IGDB error response", {
        route: options.route,
        latencyMs: Date.now() - startedAt,
        status: response.status,
      });
      throw new ApiError(
        "IGDB_UNAVAILABLE",
        "The game catalog is temporarily unavailable",
        503,
      );
    }
    if (!response.ok) {
      logger.error("IGDB bad request (query bug)", {
        route: options.route,
        latencyMs: Date.now() - startedAt,
        status: response.status,
        body: body.slice(0, 300),
      });
      throw new ApiError(
        "INTERNAL_ERROR",
        "The game catalog returned an unexpected response",
        500,
      );
    }
    try {
      const payload: unknown = await response.json();
      logger.info("IGDB request ok", {
        route: options.route,
        latencyMs: Date.now() - startedAt,
      });
      return payload;
    } catch {
      logger.error("IGDB malformed response", {
        route: options.route,
        latencyMs: Date.now() - startedAt,
        status: response.status,
      });
      throw new ApiError(
        "INTERNAL_ERROR",
        "The game catalog returned an unexpected response",
        500,
      );
    }
  };
  return attempt(false);
}
