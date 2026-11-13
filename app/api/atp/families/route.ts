import { handleRoute, ok } from "@/server/shared/route-handler";
import { getSessionUser } from "@/server/auth/session";
import { listAtpFamilies } from "@/server/atp/families";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    // Derived server-side from the platform taxonomy (no persistence,
    // no client fan-out); the family list is bounded, so no pagination.
    return ok(await listAtpFamilies());
  });
}
