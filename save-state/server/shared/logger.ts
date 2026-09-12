/**
 * Minimal server-side logger.
 *
 * Deliberately small: structured console output with secret redaction.
 * No external providers, no transports, no telemetry — those are separate
 * architectural decisions, not Phase 2 infrastructure.
 *
 * Never pass secrets to these functions and expect them to be kept:
 * redaction is a safety net, not a vault. JWTs, passwords, hashes,
 * cookies, authorization headers, and connection strings must never be
 * logged by application code in the first place.
 */

import "server-only";

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|passwd|pwd|cookie|authorization|jwt|api[_-]?key|session/i;

// Matches embedded credentials in MongoDB-style connection strings:
// `mongodb://user:pass@host/...` → `mongodb://***@host/...`
const CONNECTION_CREDENTIALS_PATTERN = /:\/\/([^/\s:@]+):([^/\s@]+)@/g;

// Matches `Bearer <token>` header values.
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/=]+/g;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(CONNECTION_CREDENTIALS_PATTERN, "://***@")
      .replace(BEARER_PATTERN, "Bearer ***");
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      redacted[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "***"
        : redactValue(entry);
    }
    return redacted;
  }
  return value;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, message: string, details?: unknown): void {
  const payload =
    details === undefined
      ? { level, message }
      : { level, message, details: redactValue(details) };
  // Intentional console usage: this module IS the minimal server logger.
  console[level](JSON.stringify(payload));
}

export const logger = {
  debug(message: string, details?: unknown): void {
    if (process.env.LOG_LEVEL === "debug") emit("debug", message, details);
  },
  info(message: string, details?: unknown): void {
    emit("info", message, details);
  },
  warn(message: string, details?: unknown): void {
    emit("warn", message, details);
  },
  error(message: string, details?: unknown): void {
    emit("error", message, details);
  },
};
