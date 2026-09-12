import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { atpSearchQuerySchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { searchAtpGames } from "@/server/atp/client";
import { toAtpSearchCard } from "@/server/atp/cards";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const query = parseQuery(
      atpSearchQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await searchAtpGames(query);
    // Covers resolve lazily per card via /api/atp/games/:id/cover —
    // never fanned out here (ADR-023).
    return NextResponse.json(
      {
        data: result.data.map(toAtpSearchCard),
        pagination: result.pagination,
      },
      { status: 200 },
    );
  });
}
