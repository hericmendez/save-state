import { NextResponse, type NextRequest } from "next/server";
import { created, handleRoute } from "@/server/shared/route-handler";
import { parseBody, parseQuery, searchParamsToObject } from "@/server/shared/validation";
import { createGameListSchema, listGameListsQuerySchema } from "@/schemas/lists";
import { getSessionUser } from "@/server/auth/session";
import { createGameList, listGameLists } from "@/server/lists/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const query = parseQuery(
      listGameListsQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await listGameLists(session.id, query);
    return NextResponse.json(result, { status: 200 });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const body = parseBody(createGameListSchema, await request.json());
    return created(await createGameList(session.id, body));
  });
}
