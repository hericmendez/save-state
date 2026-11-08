import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { searchQuerySchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { searchCatalogPage } from "@/server/search/catalog-reads";
import { igdbForcedSource } from "@/server/search/service";

export const runtime = "nodejs";

/**
 * Direct IGDB search for the Novo Jogo metadata lookup (Etapa 5).
 * Always uses IGDB regardless of SEARCH_METHOD — the sanctioned
 * exception to provider neutrality. Same envelope as /api/search.
 */
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const query = parseQuery(
      searchQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await searchCatalogPage(
      query,
      session.id,
      igdbForcedSource(),
    );
    return NextResponse.json(result, { status: 200 });
  });
}
