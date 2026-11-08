import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseQuery, searchParamsToObject } from "@/server/shared/validation";
import { atpCoverSearchQuerySchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { searchAtpCovers } from "@/server/atp/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const query = parseQuery(
      atpCoverSearchQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    return ok(await searchAtpCovers(query));
  });
}
