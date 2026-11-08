import type { NextRequest } from "next/server";
import { handleRoute, noContent } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { gameIdAndCollectionIdParamSchema } from "@/schemas/collections";
import { getSessionUser } from "@/server/auth/session";
import {
  addCollectionToGame,
  removeCollectionFromGame,
} from "@/server/collections/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ gameId: string; collectionId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, collectionId } = parseParams(
      gameIdAndCollectionIdParamSchema,
      await params,
    );
    await addCollectionToGame(session.id, gameId, collectionId);
    return noContent();
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, collectionId } = parseParams(
      gameIdAndCollectionIdParamSchema,
      await params,
    );
    await removeCollectionFromGame(session.id, gameId, collectionId);
    return noContent();
  });
}
