import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { atpIdParamSchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { getAtpPlatform } from "@/server/atp/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    await getSessionUser(request);
    // Catalog slugs share the game-id charset; same allowlisted validation.
    const { id } = parseParams(atpIdParamSchema, await params);
    return ok(await getAtpPlatform(id));
  });
}
