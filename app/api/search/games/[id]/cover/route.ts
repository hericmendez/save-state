import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { searchIdParamSchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { getSearchProvider } from "@/server/search/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const { id } = parseParams(searchIdParamSchema, await params);
    const cover = await getSearchProvider()
      .getGameCover(id)
      .catch(() => null);
    // Same envelope as the legacy /api/atp/games/:id/cover route
    // ({coverUrl, cover}) so existing card hooks keep working.
    return ok({ coverUrl: cover?.url ?? null, cover });
  });
}
