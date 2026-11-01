import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseQuery, searchParamsToObject } from "@/server/shared/validation";
import { collectionGamesQueryInputSchema, normalizeCollectionKeys } from "@/schemas/games";
import { getSessionUser } from "@/server/auth/session";
import { getGameStats } from "@/server/stats/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    // Stats share the listing filters but never paginate.
    const raw = parseQuery(
      collectionGamesQueryInputSchema.omit({ page: true, limit: true }),
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const filters = normalizeCollectionKeys(raw);
    const result = await getGameStats(session.id, filters);
    return ok(result);
  });
}
