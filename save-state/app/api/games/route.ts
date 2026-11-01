import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, created } from "@/server/shared/route-handler";
import { parseBody, parseQuery, searchParamsToObject } from "@/server/shared/validation";
import { createGameSchema, collectionGamesQuerySchema } from "@/schemas/games";
import { getSessionUser } from "@/server/auth/session";
import { createGame, listGames } from "@/server/games/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const query = parseQuery(
      collectionGamesQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await listGames(session.id, query);
    return NextResponse.json(result, { status: 200 });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const body = parseBody(createGameSchema, await request.json());
    return created(await createGame({ userId: session.id, ...body }));
  });
}
