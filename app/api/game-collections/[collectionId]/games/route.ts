import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseParams,
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import {
  collectionGamesInCollectionQuerySchema,
  collectionIdParamSchema,
} from "@/schemas/collections";
import { getSessionUser } from "@/server/auth/session";
import { listGamesInCollection } from "@/server/collections/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { collectionId } = parseParams(collectionIdParamSchema, await params);
    const query = parseQuery(
      collectionGamesInCollectionQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await listGamesInCollection(session.id, collectionId, query);
    return NextResponse.json(result, { status: 200 });
  });
}
