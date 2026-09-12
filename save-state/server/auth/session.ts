/**
 * Server-side auth session: JWT signing/verification, cookie handling,
 * and session lookup. Server-only.
 *
 * Semantics mirror the legacy Express implementation:
 * - cookie named `token`, httpOnly, SameSite=Lax, path=/,
 *   secure in production only;
 * - JWT claims `{ userId, sessionVersion }` with the configured expiry;
 * - every authenticated lookup revalidates `sessionVersion` against the
 *   current User record.
 */

import "server-only";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/env";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { User } from "@/db/models/user";

export const AUTH_COOKIE_NAME = "token";

export interface SessionUser {
  id: string;
}

interface JwtClaims {
  userId: string;
  sessionVersion: number;
}

export function signToken(payload: { userId: string; sessionVersion: number }): string {
  const { JWT_SECRET, JWT_EXPIRES_IN } = loadServerEnv();
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

const MS_PER_UNIT: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parse durations like `7d`/`12h`/`30m` to seconds for cookie Max-Age. */
export function parseExpiresToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60;
  return Math.floor((Number(match[1]) * MS_PER_UNIT[match[2]]) / 1000);
}

function cookieAttributes(maxAgeSeconds?: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds }),
  };
}

export function setAuthCookie(response: NextResponse, token: string): void {
  const { JWT_EXPIRES_IN } = loadServerEnv();
  response.cookies.set(
    AUTH_COOKIE_NAME,
    token,
    cookieAttributes(parseExpiresToSeconds(JWT_EXPIRES_IN)),
  );
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...cookieAttributes(),
    maxAge: 0,
  });
}

const INVALID_TOKEN = "Invalid authentication token";

/**
 * Resolve the session user from the request cookie.
 * Throws `UNAUTHENTICATED` for every failure mode (missing, malformed,
 * expired, unknown user, or stale sessionVersion) without distinguishing
 * between them.
 */
export async function getSessionUser(
  request: NextRequest,
): Promise<SessionUser> {
  return getSessionUserFromToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

/**
 * Resolve the session for a Server Component via `next/headers`.
 * Throws `UNAUTHENTICATED` exactly like the Route Handler variant.
 */
export async function getCurrentSession(): Promise<SessionUser> {
  const store = await cookies();
  return getSessionUserFromToken(store.get(AUTH_COOKIE_NAME)?.value);
}

/**
 * Resolve a session from a raw cookie value. Shared by the NextRequest
 * variant above and by Server Components (which read cookies via
 * `next/headers` instead of holding a request object).
 */
export async function getSessionUserFromToken(
  token: string | undefined,
): Promise<SessionUser> {
  if (!token) {
    throw new ApiError("UNAUTHENTICATED", "Authentication is required");
  }
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, loadServerEnv().JWT_SECRET);
  } catch {
    throw new ApiError("UNAUTHENTICATED", INVALID_TOKEN);
  }

  if (typeof decoded !== "object" || decoded === null) {
    throw new ApiError("UNAUTHENTICATED", INVALID_TOKEN);
  }
  const claims = decoded as Partial<JwtClaims>;
  if (typeof claims.userId !== "string") {
    throw new ApiError("UNAUTHENTICATED", INVALID_TOKEN);
  }
  if (
    typeof claims.sessionVersion !== "number" ||
    !Number.isInteger(claims.sessionVersion) ||
    claims.sessionVersion < 0
  ) {
    throw new ApiError("UNAUTHENTICATED", INVALID_TOKEN);
  }

  await connectDatabase();
  const user = await User.findById(claims.userId)
    .select("sessionVersion")
    .lean();
  if (!user) {
    throw new ApiError("UNAUTHENTICATED", INVALID_TOKEN);
  }
  const currentVersion = user.sessionVersion ?? 0;
  if (currentVersion !== claims.sessionVersion) {
    throw new ApiError("UNAUTHENTICATED", INVALID_TOKEN);
  }

  return { id: claims.userId };
}
