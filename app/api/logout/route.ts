import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-error";
import { getSessionUser, clearAuthCookie } from "@/server/auth/session";
import { revokeUserSessions } from "@/server/auth/service";
import { handleRoute, ok } from "@/server/shared/route-handler";

export const runtime = "nodejs";

/**
 * Intentionally mounted outside `/api/auth/*`, preserving the legacy route.
 * Revokes every session for this account, then clears the current browser cookie.
 * The original ADR-019 decision is superseded by the W-09 decision recorded in
 * the production-readiness document; this intentionally signs out all devices.
 */
export async function POST(request: NextRequest) {
  const response = await handleRoute(async () => {
    if (request.cookies.get("token")?.value) {
      let session;
      try {
        session = await getSessionUser(request);
      } catch (error) {
        // Logout remains idempotent for missing/invalid/already-revoked tokens.
        // Database failures are not converted to success and surface as a
        // sanitized 500; the local browser cookie is still cleared below.
        if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
          return ok({ message: "Logged out" });
        }
        throw error;
      }
      await revokeUserSessions(session.id);
    }
    return ok({ message: "Logged out" });
  });
  clearAuthCookie(response);
  return response;
}
