import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseParams,
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import {
  listGamesInListQuerySchema,
  listIdParamSchema,
} from "@/schemas/lists";
import { getSessionUser } from "@/server/auth/session";
import { listGamesInList } from "@/server/lists/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { listId } = parseParams(listIdParamSchema, await params);
    const query = parseQuery(
      listGamesInListQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await listGamesInList(session.id, listId, query);
    return NextResponse.json(result, { status: 200 });
  });
}
