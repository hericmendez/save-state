import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { searchCoverSearchQuerySchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { getSearchProvider } from "@/server/search/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const query = parseQuery(
      searchCoverSearchQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const candidates = await getSearchProvider().searchCovers(query);
    // Same envelope as the legacy /api/atp/covers/search route:
    // ok(array) → { data: [...] }, not { data: { candidates } }.
    return ok(candidates);
  });
}
