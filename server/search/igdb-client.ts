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
import { createHash } from "node:crypto";
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
export const IGDB_MAX_IN_FLIGHT = 8;
export const IGDB_MAX_RETRY_AFTER_MS = 2_000;
const FALLBACK_RETRY_BASE_MS = 250;
const FALLBACK_RETRY_MAX_MS = 1_000;
const MAX_QUEUED_IGDB_REQUESTS = 500;

let lastStartAt = 0;
let requestsInFlight = 0;
let maxRequestsInFlight = 0;
let admissionTimer: ReturnType<typeof setTimeout> | null = null;
const admissionQueue: AdmissionWaiter[] = [];
const MAX_PENDING_IGDB_REQUESTS = 500;
const pendingRequests = new Map<string, PendingFlight>();

interface AdmissionMetrics {
  throttleWaitMs: number;
  concurrencyWaitMs: number;
}

interface PhysicalPermit extends AdmissionMetrics {
  release(): void;
}

interface AdmissionWaiter {
  resolve(permit: PhysicalPermit): void;
  reject(error: unknown): void;
  signal: AbortSignal;
  reason: "throttle" | "concurrency" | null;
  reasonSince: number;
  throttleWaitMs: number;
  concurrencyWaitMs: number;
  onAbort(): void;
}

interface PendingFlight {
  promise: Promise<unknown>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
  deadlineTimer: ReturnType<typeof setTimeout>;
  phase: "token" | "admission" | "request" | "backoff";
}

class OperationDeadlineError extends Error {
  constructor() {
    super("IGDB operation deadline exceeded");
    this.name = "TimeoutError";
  }
}

function changeWaitReason(
  waiter: AdmissionWaiter,
  reason: AdmissionWaiter["reason"],
): void {
  const now = Date.now();
  if (waiter.reason) {
    const elapsed = now - waiter.reasonSince;
    if (waiter.reason === "throttle") waiter.throttleWaitMs += elapsed;
    else waiter.concurrencyWaitMs += elapsed;
  }
  waiter.reason = reason;
  waiter.reasonSince = now;
}

function rejectAdmission(waiter: AdmissionWaiter, error: unknown): void {
  const index = admissionQueue.indexOf(waiter);
  if (index < 0) return;
  admissionQueue.splice(index, 1);
  const phase = waiter.reason ?? "queue";
  changeWaitReason(waiter, null);
  waiter.signal.removeEventListener("abort", waiter.onAbort);
  logger.warn("IGDB admission cancelled", {
    reason: error instanceof OperationDeadlineError ? "deadline" : "consumer_cancelled",
    phase,
    throttleWaitMs: waiter.throttleWaitMs,
    concurrencyWaitMs: waiter.concurrencyWaitMs,
    inFlight: requestsInFlight,
    queued: admissionQueue.length,
  });
  waiter.reject(error);
  pumpAdmissionQueue();
}

function pumpAdmissionQueue(): void {
  if (admissionTimer) {
    clearTimeout(admissionTimer);
    admissionTimer = null;
  }

  while (admissionQueue.length > 0 && requestsInFlight < IGDB_MAX_IN_FLIGHT) {
    const waiter = admissionQueue[0];
    const now = Date.now();
    // Reserve one clock tick for the promise continuation that invokes fetch;
    // spacing is measured from dispatch, not permit resolution.
    const nextStartAt = lastStartAt + IGDB_MIN_INTERVAL_MS;
    if (lastStartAt > 0 && now < nextStartAt) {
      changeWaitReason(waiter, "throttle");
      admissionTimer = setTimeout(
        () => {
          admissionTimer = null;
          pumpAdmissionQueue();
        },
        Math.max(1, nextStartAt - now),
      );
      return;
    }

    admissionQueue.shift();
    changeWaitReason(waiter, null);
    waiter.signal.removeEventListener("abort", waiter.onAbort);
    requestsInFlight += 1;
    maxRequestsInFlight = Math.max(maxRequestsInFlight, requestsInFlight);
    lastStartAt = Date.now() + 1;
    let released = false;
    const permit: PhysicalPermit = {
      throttleWaitMs: waiter.throttleWaitMs,
      concurrencyWaitMs: waiter.concurrencyWaitMs,
      release() {
        if (released) return;
        released = true;
        requestsInFlight = Math.max(0, requestsInFlight - 1);
        pumpAdmissionQueue();
      },
    };
    waiter.resolve(permit);
  }

  if (admissionQueue.length > 0) {
    changeWaitReason(admissionQueue[0], "concurrency");
  }
}

function acquirePhysicalPermit(signal: AbortSignal): Promise<PhysicalPermit> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (admissionQueue.length >= MAX_QUEUED_IGDB_REQUESTS) {
    logger.warn("IGDB admission rejected", {
      reason: "queue_capacity",
      queued: admissionQueue.length,
      inFlight: requestsInFlight,
    });
    return Promise.reject(unavailableError());
  }
  return new Promise<PhysicalPermit>((resolve, reject) => {
    const waiter: AdmissionWaiter = {
      resolve,
      reject,
      signal,
      reason: null,
      reasonSince: Date.now(),
      throttleWaitMs: 0,
      concurrencyWaitMs: 0,
      onAbort: () => rejectAdmission(waiter, signal.reason),
    };
    signal.addEventListener("abort", waiter.onAbort, { once: true });
    admissionQueue.push(waiter);
    pumpAdmissionQueue();
    if (admissionQueue.includes(waiter)) {
      logger.info("IGDB admission waiting", {
        phase: waiter.reason ?? "queue",
        queued: admissionQueue.length,
        inFlight: requestsInFlight,
      });
    }
  });
}

/** Test-only hook: reset the local scheduler and single-flight state. */
export function __resetIgdbThrottle(): void {
  if (admissionTimer) clearTimeout(admissionTimer);
  admissionTimer = null;
  for (const waiter of admissionQueue.splice(0)) {
    waiter.signal.removeEventListener("abort", waiter.onAbort);
    waiter.reject(new Error("IGDB test scheduler reset"));
  }
  for (const flight of pendingRequests.values()) {
    clearTimeout(flight.deadlineTimer);
    flight.controller.abort(new Error("IGDB test scheduler reset"));
  }
  lastStartAt = 0;
  requestsInFlight = 0;
  maxRequestsInFlight = 0;
  pendingRequests.clear();
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
  /** Low-cardinality logical workflow label; never include user/query data. */
  operation?: string;
  /** Cancels only this caller's wait; shared external work remains available to others. */
  signal?: AbortSignal;
}

export async function igdbRequest(
  endpoint: string,
  body: string,
  options: IgdbRequestOptions,
  source?: Record<string, string | undefined>,
): Promise<unknown> {
  if (options.signal?.aborted) {
    return Promise.reject(options.signal.reason ?? new Error("Request cancelled"));
  }
  const env = loadServerEnv(source);
  const clientId = env.TWITCH_CLIENT_ID?.trim() ?? "";
  const credentialFingerprint = createHash("sha256")
    .update(`${clientId}\0${env.TWITCH_CLIENT_SECRET ?? ""}`)
    .digest("hex");
  // JSON array encoding avoids ambiguous concatenation. Include logical operation,
  // timeout and credential identity because all can change semantics.
  const key = JSON.stringify([
    endpoint,
    body,
    options.timeoutMs,
    options.route,
    options.operation ?? "other",
    credentialFingerprint,
  ]);
  const existing = pendingRequests.get(key);
  if (existing) {
    logger.info("IGDB single-flight", {
      outcome: "shared",
      avoidedExternalCalls: 1,
      pending: pendingRequests.size,
    });
    return waitForCaller(existing, key, options.signal);
  }

  // Under pressure, bypass deduplication rather than allowing unbounded memory.
  // Each bypass remains independently throttled and observed.
  if (pendingRequests.size >= MAX_PENDING_IGDB_REQUESTS) {
    logger.warn("IGDB single-flight", {
      outcome: "capacity_bypass",
      pending: pendingRequests.size,
    });
    const deadlineAt =
      Date.now() + options.timeoutMs * 2 + IGDB_MAX_RETRY_AFTER_MS;
    return waitForCaller(
      createFlight(endpoint, body, options, source, deadlineAt),
      null,
      options.signal,
    );
  }

  const deadlineAt =
    Date.now() + options.timeoutMs * 2 + IGDB_MAX_RETRY_AFTER_MS;
  const flight = createFlight(endpoint, body, options, source, deadlineAt);
  pendingRequests.set(key, flight);
  return waitForCaller(flight, key, options.signal);
}

function createFlight(
  endpoint: string,
  body: string,
  options: IgdbRequestOptions,
  source: Record<string, string | undefined> | undefined,
  deadlineAt: number,
): PendingFlight {
  const controller = new AbortController();
  const deadlineTimer = setTimeout(
    () => controller.abort(new OperationDeadlineError()),
    Math.max(1, deadlineAt - Date.now()),
  );
  let flight!: PendingFlight;
  const promise = Promise.resolve().then(() =>
    executeIgdbRequest(
      endpoint,
      body,
      options,
      source,
      controller.signal,
      deadlineAt,
      (phase) => {
        flight.phase = phase;
      },
    ),
  );
  flight = {
    promise,
    controller,
    consumers: 0,
    settled: false,
    deadlineTimer,
    phase: "token",
  };
  void flight.promise.finally(() => {
    flight.settled = true;
    clearTimeout(flight.deadlineTimer);
    for (const [key, pending] of pendingRequests) {
      if (pending === flight) {
        pendingRequests.delete(key);
        break;
      }
    }
  }).catch(() => {
    // The caller receives the original rejection; consume the cleanup Promise.
  });
  return flight;
}

function waitForCaller<T>(
  flight: PendingFlight & { promise: Promise<T> },
  key: string | null,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Request cancelled"));
  flight.consumers += 1;
  const sharedPromise = flight.promise as Promise<T>;
  let released = false;
  const releaseConsumer = (cancelled: boolean) => {
    if (released) return;
    released = true;
    if (signal) signal.removeEventListener("abort", onAbort);
    flight.consumers = Math.max(0, flight.consumers - 1);
    const cancelsSharedOperation =
      cancelled && flight.consumers === 0 && !flight.settled;
    if (cancelled) {
      logger.info("IGDB consumer cancelled", {
        phase: flight.phase,
        remainingConsumers: flight.consumers,
        cancelsSharedOperation,
      });
    }
    if (cancelsSharedOperation) {
      if (key && pendingRequests.get(key) === flight) pendingRequests.delete(key);
      const reason = new Error("All IGDB request consumers cancelled");
      reason.name = "AbortError";
      flight.controller.abort(reason);
    }
  };
  let onAbort = () => {};
  return new Promise<T>((resolve, reject) => {
    onAbort = () => {
      releaseConsumer(true);
      reject(signal?.reason ?? Object.assign(new Error("Request cancelled"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    sharedPromise.then(
      (value) => {
        releaseConsumer(false);
        resolve(value);
      },
      (error) => {
        releaseConsumer(false);
        reject(error);
      },
    );
  });
}

async function executeIgdbRequest(
  endpoint: string,
  body: string,
  options: IgdbRequestOptions,
  source?: Record<string, string | undefined>,
  operationSignal?: AbortSignal,
  deadlineAt = Date.now() + options.timeoutMs * 2 + IGDB_MAX_RETRY_AFTER_MS,
  setPhase: (phase: PendingFlight["phase"]) => void = () => {},
): Promise<unknown> {
  if (!operationSignal) {
    throw new Error("IGDB operation signal is required");
  }
  return executeWithRetries(
    endpoint,
    body,
    options,
    source,
    operationSignal,
    deadlineAt,
    setPhase,
  );
}

function isDeadlineError(error: unknown): boolean {
  return error instanceof OperationDeadlineError;
}

function unavailableError(): ApiError {
  return new ApiError(
    "IGDB_UNAVAILABLE",
    "The game catalog is temporarily unavailable",
    503,
  );
}

function rateLimitError(): ApiError {
  return new ApiError(
    "RATE_LIMIT_EXCEEDED",
    "Too many requests, try again later",
    429,
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (isDeadlineError(signal.reason)) throw unavailableError();
  throw signal.reason ?? Object.assign(new Error("Request cancelled"), { name: "AbortError" });
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    }).catch(() => {
      // The returned Promise carries the original result/rejection.
    });
  });
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (delayMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

type RetryAfterValue =
  | { kind: "valid"; delayMs: number }
  | { kind: "invalid" }
  | { kind: "excessive" };

function parseRetryAfter(value: string | null, now: number): RetryAfterValue {
  if (value === null || value.trim() === "") return { kind: "invalid" };
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    if (!Number.isFinite(seconds)) return { kind: "excessive" };
    const delayMs = seconds * 1000;
    if (delayMs > IGDB_MAX_RETRY_AFTER_MS) return { kind: "excessive" };
    return { kind: "valid", delayMs };
  }
  // A signed or decimal numeric value is not a valid delay-seconds value;
  // don't allow Date.parse to reinterpret it as a calendar date.
  if (/^[+-]?\d/.test(normalized)) return { kind: "invalid" };
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return { kind: "invalid" };
  const delayMs = Math.max(0, timestamp - now);
  if (delayMs > IGDB_MAX_RETRY_AFTER_MS) return { kind: "excessive" };
  return { kind: "valid", delayMs };
}

function fallbackRetryDelayMs(retryIndex: number): number {
  const cap = Math.min(
    FALLBACK_RETRY_MAX_MS,
    FALLBACK_RETRY_BASE_MS * 2 ** retryIndex,
  );
  return Math.floor(cap / 2 + Math.random() * (cap / 2));
}

function retryBudgetExhausted(
  options: IgdbRequestOptions,
  attempt: number,
  reason: string,
): void {
  logger.warn("IGDB retry budget exhausted", {
    endpoint: options.route,
    operation: options.operation ?? "other",
    reason,
    attempt,
  });
}

async function executeWithRetries(
  endpoint: string,
  body: string,
  options: IgdbRequestOptions,
  source: Record<string, string | undefined> | undefined,
  operationSignal: AbortSignal,
  deadlineAt: number,
  setPhase: (phase: PendingFlight["phase"]) => void,
): Promise<unknown> {
  const clientId = loadServerEnv(source).TWITCH_CLIENT_ID?.trim() ?? "";
  let retried401 = false;
  let retried429 = false;
  let attemptNumber = 0;
  let lastRateLimitError: ApiError | null = null;

  while (true) {
    try {
      throwIfAborted(operationSignal);
      setPhase("token");
      const token = await awaitWithAbort(getTwitchToken(source), operationSignal);
      throwIfAborted(operationSignal);
      setPhase("admission");
      const permit = await acquirePhysicalPermit(operationSignal);
      const requestStartedAt = Date.now();
      const remainingMs = deadlineAt - requestStartedAt;
      if (remainingMs <= 0) {
        permit.release();
        retryBudgetExhausted(options, attemptNumber, "operation_deadline");
        if (lastRateLimitError) throw lastRateLimitError;
        throw unavailableError();
      }

      attemptNumber += 1;
      let response: Response | undefined;
      let payload: unknown;
      let malformedResponse = false;
      let transportError: unknown;
      const attemptTimeoutMs = Math.max(
        1,
        Math.min(options.timeoutMs, remainingMs),
      );
      const timeoutSignal = AbortSignal.timeout(attemptTimeoutMs);
      const fetchSignal = AbortSignal.any([operationSignal, timeoutSignal]);
      setPhase("request");
      try {
        response = await fetch(`${IGDB_BASE_URL}${endpoint}`, {
          method: "POST",
          headers: {
            "Client-ID": clientId,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
            Accept: "application/json",
          },
          body,
          signal: fetchSignal,
        });
        if (response.ok) {
          try {
            payload = await response.json();
          } catch (error) {
            if (timeoutSignal.aborted || operationSignal.aborted) {
              transportError = error;
            } else {
              malformedResponse = true;
            }
          }
        } else {
          try {
            await response.body?.cancel();
          } catch {
            // Response cleanup must not replace the upstream HTTP contract.
          }
        }
      } catch (error) {
        transportError = error;
      } finally {
        permit.release();
      }

      const metrics = {
        execution: "external",
        endpoint: options.route,
        operation: options.operation ?? "other",
        latencyMs: Date.now() - requestStartedAt,
        throttleWaitMs: permit.throttleWaitMs,
        concurrencyWaitMs: permit.concurrencyWaitMs,
        inFlight: requestsInFlight,
        maxInFlight: maxRequestsInFlight,
        attempt: attemptNumber,
      };

      if (transportError !== undefined) {
        if (operationSignal.aborted) {
          logger.warn("IGDB external request", {
            ...metrics,
            statusClass: "cancelled",
            failure: isDeadlineError(operationSignal.reason)
              ? "deadline"
              : "cancelled",
          });
          throw operationSignal.reason;
        }
        const timeout =
          timeoutSignal.aborted ||
          (typeof transportError === "object" &&
            transportError !== null &&
            (transportError as { name?: unknown }).name === "TimeoutError");
        logger.error("IGDB external request", {
          ...metrics,
          statusClass: "network_error",
          failure: timeout ? "timeout" : "connection",
        });
        throw unavailableError();
      }

      if (!response) throw unavailableError();
      const statusClass = `${Math.floor(response.status / 100)}xx`;
      const requestMetrics = {
        ...metrics,
        status: response.status,
        statusClass,
      };

      if (malformedResponse) {
        logger.error("IGDB malformed response", requestMetrics);
        throw new ApiError(
          "INTERNAL_ERROR",
          "The game catalog returned an unexpected response",
          500,
        );
      }

      if (response.status === 401 && !retried401) {
        retried401 = true;
        invalidateTwitchToken(token);
        logger.warn("IGDB external request", {
          ...requestMetrics,
          retrying: true,
        });
        logger.info("IGDB retry", {
          endpoint: options.route,
          operation: options.operation ?? "other",
          reason: "unauthorized",
          attempt: attemptNumber,
          retryNumber: 1,
          waitMs: 0,
        });
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        if (response.status === 401 && retried401) {
          retryBudgetExhausted(options, attemptNumber, "max_401_retries");
        }
        logger.warn("IGDB external request", requestMetrics);
        throw new ApiError(
          "INTERNAL_ERROR",
          "IGDB integration is not configured (invalid Twitch credentials)",
          500,
        );
      }

      if (response.status === 429) {
        logger.warn("IGDB external request", requestMetrics);
        lastRateLimitError = rateLimitError();
        if (retried429) {
          retryBudgetExhausted(options, attemptNumber, "max_429_retries");
          throw lastRateLimitError;
        }

        const retryAfter = parseRetryAfter(
          response.headers?.get?.("Retry-After") ?? null,
          Date.now(),
        );
        if (retryAfter.kind === "excessive") {
          retryBudgetExhausted(options, attemptNumber, "retry_after_exceeds_budget");
          throw lastRateLimitError;
        }
        const delayMs =
          retryAfter.kind === "valid"
            ? retryAfter.delayMs
            : fallbackRetryDelayMs(0);
        const delaySource =
          retryAfter.kind === "valid" ? "retry_after" : "fallback";
        if (Date.now() + delayMs >= deadlineAt) {
          retryBudgetExhausted(options, attemptNumber, "operation_deadline");
          throw lastRateLimitError;
        }

        retried429 = true;
        setPhase("backoff");
        logger.info("IGDB retry", {
          endpoint: options.route,
          operation: options.operation ?? "other",
          reason: "rate_limit",
          attempt: attemptNumber,
          retryNumber: 1,
          delaySource,
          waitMs: delayMs,
        });
        try {
          await abortableDelay(delayMs, operationSignal);
        } catch (error) {
          if (isDeadlineError(error)) {
            retryBudgetExhausted(options, attemptNumber, "operation_deadline");
            throw lastRateLimitError;
          }
          throw error;
        }
        if (operationSignal.aborted && isDeadlineError(operationSignal.reason)) {
          retryBudgetExhausted(options, attemptNumber, "operation_deadline");
          throw lastRateLimitError;
        }
        continue;
      }

      if (response.status >= 500) {
        logger.warn("IGDB external request", requestMetrics);
        throw unavailableError();
      }
      if (!response.ok) {
        // Do not log the Apicalypse body: search text may be user-provided.
        logger.error("IGDB external request", requestMetrics);
        throw new ApiError(
          "INTERNAL_ERROR",
          "The game catalog returned an unexpected response",
          500,
        );
      }

      logger.info("IGDB external request", requestMetrics);
      return payload;
    } catch (error) {
      if (operationSignal.aborted) {
        if (isDeadlineError(operationSignal.reason)) {
          if (lastRateLimitError) {
            retryBudgetExhausted(options, attemptNumber, "operation_deadline");
            throw lastRateLimitError;
          }
          throw unavailableError();
        }
        throw operationSignal.reason ?? error;
      }
      throw error;
    }
  }
}
