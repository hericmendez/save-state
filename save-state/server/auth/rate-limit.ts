/**
 * Authentication rate limiting with the exact legacy semantics:
 * in-memory buckets per `{client}:{route}`, fixed windows, silent pass in
 * test environments.
 *
 * Per ADR-021 this preserves current behavior. The in-memory store is NOT
 * a durable distributed production solution; durability must be evaluated
 * before production deployment. This module must not be repurposed as a
 * general limiter without that evaluation.
 */

import "server-only";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-error";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export const AUTH_RATE_LIMIT: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  max: 20,
};

export const FORGOT_PASSWORD_RATE_LIMIT: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  max: 5,
};

export const RESET_PASSWORD_RATE_LIMIT: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  max: 10,
};

export const CHANGE_PASSWORD_RATE_LIMIT: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  max: 5,
};

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}

/**
 * Enforce the limit for one route. Throws `RATE_LIMIT_EXCEEDED` (429)
 * when the bucket is exhausted. No-op when `NODE_ENV === "test"` so the
 * suite stays deterministic.
 */
export function checkRateLimit(
  request: NextRequest,
  routeKey: string,
  options: RateLimitOptions,
): void {
  if (process.env.NODE_ENV === "test") return;

  const key = `${clientKey(request)}:${routeKey}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > options.max) {
    throw new ApiError(
      "RATE_LIMIT_EXCEEDED",
      "Too many requests, try again later",
      429,
    );
  }
}

/** Test-only hook: clear all buckets between test cases. */
export function __resetRateLimitBuckets(): void {
  buckets.clear();
}
