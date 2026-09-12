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
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 },
  );
}
