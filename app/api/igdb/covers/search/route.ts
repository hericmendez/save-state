import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { searchCoverSearchQuerySchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { IgdbSearchProvider } from "@/server/search/igdb-provider";
import { igdbForcedSource } from "@/server/search/service";

export const runtime = "nodejs";

/**
 * Direct IGDB cover search for the Novo Jogo cover lookup (Etapa 5).
 * Always uses IGDB regardless of SEARCH_METHOD. Same envelope as
 * /api/search/covers/search: ok(array) → { data: [...] }.
 */
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const query = parseQuery(
      searchCoverSearchQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const candidates = await new IgdbSearchProvider().searchCovers(
      query,
      igdbForcedSource(),
    );
    return ok(candidates);
  });
}
