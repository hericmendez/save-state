/**
 * Server-only ATP HTTP client — the single owner of ATP wire details.
 *
 * Rules enforced here:
 * - All URLs are built internally from fixed path templates; the browser
 *   never supplies hosts, paths, or full URLs.
 * - ATP game IDs are validated before interpolation (opaque, bounded,
 *   no slashes or URL control characters).
 * - No browser credentials are ever forwarded: no cookies, no
 *   Authorization headers — only Accept headers on direct fetch calls.
 * - Every request has an explicit abort timeout; there are no retries.
 * - Every ATP payload is Zod-validated; malformed responses become
 *   controlled INTERNAL_ERROR failures, never raw upstream bodies.
 */

import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { loadServerEnv } from "@/lib/env";
import { logger } from "@/server/shared/logger";
import { atpIdSchema } from "@/schemas/atp";
import {
  atpCoverResponseSchema,
  atpCoverSearchResponseSchema,
  atpErrorSchema,
  atpGameSchema,
  atpPlatformListResponseSchema,
  atpPlatformSchema,
  atpSearchResponseSchema,
  type AtpCoverResponse,
  type AtpGame,
  type AtpPlatform,
  type AtpPlatformListResponse,
  type AtpSearchResponse,
} from "@/server/atp/schemas";

export const ATP_SEARCH_TIMEOUT_MS = 10_000;
export const ATP_DETAIL_TIMEOUT_MS = 10_000;
export const ATP_COVER_TIMEOUT_MS = 15_000;

function atpBaseUrl(): string {
  const { ATP_BASE_URL } = loadServerEnv();
  if (!ATP_BASE_URL) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "ATP integration is not configured",
      500,
    );
  }
  return ATP_BASE_URL.replace(/\/+$/, "");
}

/** Validate an opaque ATP game ID before URL interpolation (SSRF-safe). */
export function assertValidAtpId(id: string): void {
  if (!atpIdSchema.safeParse(id).success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid ATP game id", 400);
  }
}

interface AtpCallOptions {
  timeoutMs: number;
  route: string;
}

function extractRequestId(payload: unknown): string | undefined {
  const parsed = atpErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.error.requestId : undefined;
}

async function atpFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options: AtpCallOptions,
): Promise<T> {
  const url = `${atpBaseUrl()}${path}`;
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    const timedOut =
      typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "TimeoutError";
    logger.error("ATP request failed", {
      route: options.route,
      latencyMs: Date.now() - startedAt,
      reason: timedOut ? "timeout" : "connection",
    });
    throw new ApiError(
      "ATP_UNAVAILABLE",
      "The game catalog is temporarily unavailable",
      503,
    );
  }

  const latencyMs = Date.now() - startedAt;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logger.error("ATP malformed response", {
      route: options.route,
      latencyMs,
      status: response.status,
    });
    throw new ApiError(
      "INTERNAL_ERROR",
      "The game catalog returned an unexpected response",
      500,
    );
  }

  if (!response.ok) {
    const requestId = extractRequestId(payload);
    logger.warn("ATP error response", {
      route: options.route,
      latencyMs,
      status: response.status,
      requestId,
    });
    if (response.status === 404) {
      throw new ApiError("ATP_GAME_NOT_FOUND", "ATP game not found", 404);
    }
    if (response.status === 429) {
      throw new ApiError(
        "RATE_LIMIT_EXCEEDED",
        "Too many requests, try again later",
        429,
      );
    }
    if (response.status >= 500) {
      throw new ApiError(
        "ATP_UNAVAILABLE",
        "The game catalog is temporarily unavailable",
        503,
      );
    }
    throw new ApiError(
      "ATP_UNAVAILABLE",
      "The game catalog request failed",
      503,
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    logger.error("ATP schema mismatch", {
      route: options.route,
      latencyMs,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "value",
        message: issue.message,
      })),
    });
    throw new ApiError(
      "INTERNAL_ERROR",
      "The game catalog returned an unexpected response",
      500,
    );
  }

  logger.info("ATP request ok", { route: options.route, latencyMs });
  return parsed.data;
}

export interface AtpSearchParams {
  q: string;
  page: number;
  limit: number;
  platform?: string;
  genre?: string;
  year?: number;
  developer?: string;
  publisher?: string;
  family?: string;
  discover?: boolean;
}

function hasSearchFilters(params: AtpSearchParams): boolean {
  return (
    params.platform !== undefined ||
    params.genre !== undefined ||
    params.year !== undefined ||
    params.developer !== undefined ||
    params.publisher !== undefined ||
    params.family !== undefined
  );
}

export async function searchAtpGames(
  params: AtpSearchParams,
): Promise<AtpSearchResponse> {
  // Routing rule (audited contract): bare text search uses ATP
  // GET /api/v1/games/search (DB-first with live-discovery fallback).
  // Any refinement filter — or a filter-only browse without text — switches
  // to ATP GET /api/v1/games, the pure-DB deterministic listing. Discovery
  // results are unfiltered by nature and must never silently narrow a
  // filtered query. Both endpoints share the same paginated GameResponse
  // envelope.
  if (!hasSearchFilters(params) && params.q !== "") {
    const query = new URLSearchParams({
      q: params.q,
      page: String(params.page),
      limit: String(params.limit),
    });
    // Metadata lookup explicitly opts into live discovery on catalog
    // miss; browsing stays database-only unless requested.
    if (params.discover === true) query.set("discover", "true");
    return atpFetch(`/api/v1/games/search?${query.toString()}`, atpSearchResponseSchema, {
      timeoutMs: ATP_SEARCH_TIMEOUT_MS,
      route: "GET /api/v1/games/search",
    });
  }
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.q !== "") query.set("search", params.q);
  if (params.platform !== undefined) query.set("platform", params.platform);
  if (params.genre !== undefined) query.set("genre", params.genre);
  if (params.year !== undefined) query.set("releaseYear", String(params.year));
  if (params.developer !== undefined) query.set("developer", params.developer);
  if (params.publisher !== undefined) query.set("publisher", params.publisher);
  if (params.family !== undefined) query.set("platformFamily", params.family);
  return atpFetch(`/api/v1/games?${query.toString()}`, atpSearchResponseSchema, {
    timeoutMs: ATP_SEARCH_TIMEOUT_MS,
    route: "GET /api/v1/games",
  });
}

export async function getAtpGame(id: string): Promise<AtpGame> {  assertValidAtpId(id);
  const data = await atpFetch(
    `/api/v1/games/${encodeURIComponent(id)}`,
    z.object({ data: atpGameSchema }).passthrough(),
    { timeoutMs: ATP_DETAIL_TIMEOUT_MS, route: "GET /api/v1/games/:id" },
  );
  return data.data;
}

export interface AtpCover {
  url: string;
  width: number | null;
  height: number | null;
  source: string | null;
}

export interface AtpCoverSearchResult {
  url: string;
  source: string | null;
  width: number | null;
  height: number | null;
}

export interface AtpPlatformListParams {
  companyName?: string;
  platformStatus?: string;
  releaseYear?: number;
  showEmptyPlatforms?: boolean;
  page: number;
  limit: number;
  sort?: "name" | "releaseYear" | "gameCount";
  order?: "asc" | "desc";
}

export async function listAtpPlatforms(
  params: AtpPlatformListParams,
): Promise<AtpPlatformListResponse> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.companyName !== undefined) query.set("companyName", params.companyName);
  if (params.platformStatus !== undefined) query.set("platformStatus", params.platformStatus);
  if (params.releaseYear !== undefined) query.set("releaseYear", String(params.releaseYear));
  if (params.showEmptyPlatforms === true) query.set("showEmptyPlatforms", "true");
  if (params.sort !== undefined) query.set("sort", params.sort);
  if (params.order !== undefined) query.set("order", params.order);
  return atpFetch(`/api/v1/platforms/summary?${query.toString()}`, atpPlatformListResponseSchema, {
    timeoutMs: ATP_SEARCH_TIMEOUT_MS,
    route: "GET /api/v1/platforms/summary",
  });
}

export async function getAtpPlatform(id: string): Promise<AtpPlatform> {
  // Catalog slugs share the opaque-id charset; same SSRF-safe validation.
  assertValidAtpId(id);
  const data = await atpFetch(
    `/api/v1/platforms/${encodeURIComponent(id)}`,
    z.object({ data: atpPlatformSchema }).passthrough(),
    { timeoutMs: ATP_SEARCH_TIMEOUT_MS, route: "GET /api/v1/platforms/:platformId" },
  );
  return data.data;
}

export async function searchAtpCovers(
  params: { q: string; limit: number },
): Promise<AtpCoverSearchResult[]> {
  const query = new URLSearchParams({
    q: params.q,
    limit: String(params.limit),
  });
  const data = await atpFetch(
    `/api/v1/covers/search?${query.toString()}`,
    atpCoverSearchResponseSchema,
    { timeoutMs: ATP_SEARCH_TIMEOUT_MS, route: "GET /api/v1/covers/search" },
  );
  return data.data.candidates.map((candidate) => ({
    url: candidate.url,
    source: candidate.source ?? null,
    width: candidate.width ?? null,
    height: candidate.height ?? null,
  }));
}

export async function getAtpGameCover(id: string): Promise<AtpCover | null> {
  assertValidAtpId(id);
  const data: AtpCoverResponse = await atpFetch(
    `/api/v1/games/${encodeURIComponent(id)}/cover`,
    atpCoverResponseSchema,
    { timeoutMs: ATP_COVER_TIMEOUT_MS, route: "GET /api/v1/games/:id/cover" },
  );
  const selected = data.data.selected;
  if (!selected) return null;
  return {
    url: selected.url,
    width: selected.width ?? null,
    height: selected.height ?? null,
    source: selected.source ?? null,
  };
}
