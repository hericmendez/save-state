/**
 * Twitch OAuth token manager for IGDB (Etapa 2 infra).
 *
 * - Client credentials flow: POST id.twitch.tv/oauth2/token
 * - Token cached in-memory with expiry margin, reused across requests.
 * - Concurrency-safe: simultaneous callers share one in-flight refresh.
 * - 401 recovery: callers can call invalidateToken() and retry once.
 * - No token ever leaves the server (server-only).
 *
 * Rate-limit respect for IGDB API calls themselves lives in
 * igdb-client (Etapa 3); this module only serializes token refreshes.
 */

import "server-only";
import { ApiError } from "@/lib/api-error";
import { loadServerEnv } from "@/lib/env";
import { logger } from "@/server/shared/logger";

const TWITCH_OAUTH_URL = "https://id.twitch.tv/oauth2/token";
const TOKEN_TIMEOUT_MS = 10_000;
/** Refresh proactively 60s before expiry to absorb clock skew. */
const EXPIRY_MARGIN_MS = 60_000;
const OAUTH_ROUTE = "POST id.twitch.tv/oauth2/token";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

function requireTwitchConfig(
  source?: Record<string, string | undefined>,
): { clientId: string; clientSecret: string } {
  const env = loadServerEnv(source);
  const clientId = env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = env.TWITCH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "IGDB integration is not configured (missing Twitch credentials)",
      500,
    );
  }
  return { clientId, clientSecret };
}

async function fetchNewToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const startedAt = Date.now();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  let response: Response;
  try {
    response = await fetch(TWITCH_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "TimeoutError";
    logger.error("Twitch token refresh", {
      endpoint: OAUTH_ROUTE,
      outcome: "failure",
      failure: timedOut ? "timeout" : "connection",
      latencyMs: Date.now() - startedAt,
    });
    throw new ApiError(
      "IGDB_UNAVAILABLE",
      "The game catalog is temporarily unavailable",
      503,
    );
  }
  if (!response.ok) {
    logger.warn("Twitch token refresh", {
      endpoint: OAUTH_ROUTE,
      outcome: "failure",
      status: response.status,
      statusClass: `${Math.floor(response.status / 100)}xx`,
      latencyMs: Date.now() - startedAt,
    });
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "IGDB integration is not configured (invalid Twitch credentials)",
      500,
    );
  }
  if (response.status === 429) {
    throw new ApiError("RATE_LIMIT_EXCEEDED", "Too many requests, try again later", 429);
  }
  if (!response.ok) {
    throw new ApiError(
      "IGDB_UNAVAILABLE",
      "The game catalog is temporarily unavailable",
      503,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logger.error("Twitch token refresh", {
      endpoint: OAUTH_ROUTE,
      outcome: "failure",
      failure: "invalid_response",
      status: response.status,
      statusClass: `${Math.floor(response.status / 100)}xx`,
      latencyMs: Date.now() - startedAt,
    });
    throw new ApiError(
      "INTERNAL_ERROR",
      "The game catalog returned an unexpected response",
      500,
    );
  }
  const accessToken =
    typeof payload === "object" && payload !== null
      ? (payload as { access_token?: unknown }).access_token
      : undefined;
  const expiresIn =
    typeof payload === "object" && payload !== null
      ? (payload as { expires_in?: unknown }).expires_in
      : undefined;
  if (typeof accessToken !== "string" || accessToken === "") {
    logger.error("Twitch token refresh", {
      endpoint: OAUTH_ROUTE,
      outcome: "failure",
      failure: "missing_token",
      status: response.status,
      statusClass: `${Math.floor(response.status / 100)}xx`,
      latencyMs: Date.now() - startedAt,
    });
    throw new ApiError(
      "INTERNAL_ERROR",
      "The game catalog returned an unexpected response",
      500,
    );
  }
  const ttlMs =
    typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn * 1000
      : 3_600_000;
  cached = { accessToken, expiresAt: Date.now() + ttlMs - EXPIRY_MARGIN_MS };
  logger.info("Twitch token refresh", {
    endpoint: OAUTH_ROUTE,
    outcome: "success",
    status: response.status,
    statusClass: `${Math.floor(response.status / 100)}xx`,
    latencyMs: Date.now() - startedAt,
  });
  return accessToken;
}

/** Return a valid Twitch app token, refreshing (once, shared) if needed. */
export async function getTwitchToken(
  source?: Record<string, string | undefined>,
): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) {
    logger.info("Twitch token cache", { outcome: "hit" });
    return cached.accessToken;
  }
  if (inflight) {
    logger.info("Twitch token cache", { outcome: "single_flight" });
    return inflight;
  }
  logger.info("Twitch token cache", { outcome: "miss" });
  const { clientId, clientSecret } = requireTwitchConfig(source);
  inflight = fetchNewToken(clientId, clientSecret);
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export type TwitchTokenInvalidation =
  | "invalidated"
  | "ignored_replaced"
  | "already_empty";

/**
 * Invalidate only the token that the upstream request actually used. A late
 * 401 for an older token must not evict a newer token already in the cache.
 */
export function invalidateTwitchToken(
  rejectedToken: string,
): TwitchTokenInvalidation {
  let outcome: TwitchTokenInvalidation;
  if (cached?.accessToken === rejectedToken) {
    cached = null;
    outcome = "invalidated";
  } else if (cached) {
    outcome = "ignored_replaced";
  } else {
    outcome = "already_empty";
  }
  logger.info("Twitch token invalidation", { outcome });
  return outcome;
}

/** Test-only hook: clear cache + in-flight state between cases. */
export function __resetTwitchTokenCache(): void {
  cached = null;
  inflight = null;
}
