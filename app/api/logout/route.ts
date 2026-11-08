import { handleRoute, ok } from "@/server/shared/route-handler";
import { clearAuthCookie } from "@/server/auth/session";

export const runtime = "nodejs";

/**
 * Intentionally mounted outside `/api/auth/*`, preserving the legacy route.
 * Per ADR-019 this only clears the cookie and MUST NOT bump sessionVersion.
 */
export async function POST() {
  return handleRoute(async () => {
    const response = ok({ message: "Logged out" });
    clearAuthCookie(response);
    return response;
  });
}
