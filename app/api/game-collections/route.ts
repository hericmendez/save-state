import { NextResponse, type NextRequest } from "next/server";
import { created, handleRoute } from "@/server/shared/route-handler";
import { parseBody, parseQuery, searchParamsToObject } from "@/server/shared/validation";
import { createGameCollectionSchema, collectionGameCollectionsQuerySchema } from "@/schemas/collections";
import { getSessionUser } from "@/server/auth/session";
import { createGameCollection, listGameCollections } from "@/server/collections/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const query = parseQuery(
      collectionGameCollectionsQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await listGameCollections(session.id, query);
    return NextResponse.json(result, { status: 200 });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const body = parseBody(createGameCollectionSchema, await request.json());
    return created(await createGameCollection(session.id, body));
  });
}
