import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseParams,
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { objectIdSchema } from "@/schemas/games";
import { collectionGamesInCollectionQuerySchema } from "@/schemas/collections";
import { getSessionUser } from "@/server/auth/session";
import { listGamesInCollection } from "@/server/collections/service";
import { z } from "zod";

/**
 * Legacy Lists API — temporary compatibility adapter (Etapa 6).
 */
export const runtime = "nodejs";

const legacyListIdParamSchema = z.object({ listId: objectIdSchema });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { listId } = parseParams(legacyListIdParamSchema, await params);
    const query = parseQuery(
      collectionGamesInCollectionQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await listGamesInCollection(session.id, listId, query);
    return NextResponse.json(result, { status: 200 });
  });
}
