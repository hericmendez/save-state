import "server-only";
import { NextResponse } from "next/server";

/**
 * Foundational server error codes. This is the reusable contract foundation,
 * not the full legacy API code list — domain codes arrive with their phases.
 */
export const ERROR_CODES = [
  "INTERNAL_ERROR",
  "VALIDATION_ERROR",
  "INVALID_QUERY",
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "ROUTE_NOT_FOUND",
  // Auth-phase codes (Phase 3). The registry grows with each migration
  // phase; domain codes arrive with their own phases.
  "USER_NOT_FOUND",
  "EMAIL_ALREADY_IN_USE",
  "INVALID_PASSWORD",
  "INVALID_TOKEN",
  "RATE_LIMIT_EXCEEDED",
  // Read-phase codes (Phase 4).
  "GAME_NOT_FOUND",
  "INVALID_GAME_ID",
  "LIST_NOT_FOUND",
  "INVALID_LIST_ID",
  // Mutation-phase codes (Phase 5).
  "GAME_ALREADY_IN_LIBRARY",
  "GAME_METADATA_IMMUTABLE",
  "LIST_ALREADY_EXISTS",
  "TOP10_FULL",
  "TOP10_DUPLICATE",
  "TOP10_NOT_FAVORITE",
  "TOP10_NOT_FOUND",
  "NOTE_NOT_FOUND",
  "INVALID_NOTE_ID",
  "ACTIVITY_NOT_FOUND",
  "INVALID_ACTIVITY_ID",
  "INVALID_ID",
  "ATP_UNAVAILABLE",
  "ATP_GAME_NOT_FOUND",
  // Domain-contract closure (ADR-024): import guard for non-durable ATP
  // identities. 422 (not 400) signals "syntactically valid, semantically
  // unacceptable as a durable reference — do not retry with the same id".
  "UNSTABLE_ATP_IDENTITY",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INTERNAL_ERROR: 500,
  VALIDATION_ERROR: 400,
  INVALID_QUERY: 400,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  EMAIL_ALREADY_IN_USE: 400,
  INVALID_PASSWORD: 400,
  INVALID_TOKEN: 400,
  RATE_LIMIT_EXCEEDED: 429,
  GAME_NOT_FOUND: 404,
  INVALID_GAME_ID: 400,
  LIST_NOT_FOUND: 404,
  INVALID_LIST_ID: 400,
  GAME_ALREADY_IN_LIBRARY: 400,
  GAME_METADATA_IMMUTABLE: 400,
  LIST_ALREADY_EXISTS: 400,
  TOP10_FULL: 400,
  TOP10_DUPLICATE: 400,
  TOP10_NOT_FAVORITE: 400,
  TOP10_NOT_FOUND: 404,
  NOTE_NOT_FOUND: 404,
  INVALID_NOTE_ID: 400,
  ACTIVITY_NOT_FOUND: 404,
  INVALID_ACTIVITY_ID: 400,
  // Fallback for unanticipated Mongoose cast failures. Individual services
  // translate known id shapes to INVALID_*_ID; this preserves the legacy
  // INVALID_ID safety net without importing Mongoose here.
  INVALID_ID: 400,
  // Phase 9 ATP BFF codes.
  ATP_UNAVAILABLE: 503,
  ATP_GAME_NOT_FOUND: 404,
  // ADR-024 ATP identity quarantine.
  UNSTABLE_ATP_IDENTITY: 422,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message } };
  }

  toResponse(): NextResponse<ErrorBody> {
    return NextResponse.json(this.toBody(), { status: this.status });
  }
}

/**
 * Translate any thrown value at a Route Handler boundary into the
 * `{ error: { code, message } }` contract. Unknown failures become
 * INTERNAL_ERROR without leaking internals.
 */
export function toErrorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ApiError) return error.toResponse();
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "CastError"
  ) {
    return new ApiError("INVALID_ID", "Invalid id", 400).toResponse();
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 },
  );
}
