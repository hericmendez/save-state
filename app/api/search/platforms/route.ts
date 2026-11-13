import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { searchPlatformsQuerySchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { getSearchProvider } from "@/server/search/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const query = parseQuery(
      searchPlatformsQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await getSearchProvider().listPlatforms(query);
    return NextResponse.json(
      {
        data: result.data,
        pagination: result.pagination,
      },
      { status: 200 },
    );
  });
}
