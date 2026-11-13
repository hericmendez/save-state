import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { searchQuerySchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { searchCatalogPage } from "@/server/search/catalog-reads";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const query = parseQuery(
      searchQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    // Covers resolve lazily per card — never fanned out here.
    const result = await searchCatalogPage(query, session.id);
    return NextResponse.json(result, { status: 200 });
  });
}
