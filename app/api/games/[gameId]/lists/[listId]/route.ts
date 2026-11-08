import type { NextRequest } from "next/server";
import { handleRoute, noContent } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { objectIdSchema } from "@/schemas/games";
import { getSessionUser } from "@/server/auth/session";
import {
  addCollectionToGame,
  removeCollectionFromGame,
} from "@/server/collections/service";
import { z } from "zod";

/**
 * Legacy Lists API — temporary compatibility adapter (Etapa 6).
 * Translates listId → collectionId and delegates; prefer
 * /api/games/[gameId]/collections/[collectionId].
 */
export const runtime = "nodejs";

const legacyMembershipParamSchema = z.object({
  gameId: objectIdSchema,
  listId: objectIdSchema,
});

interface RouteContext {
  params: Promise<{ gameId: string; listId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, listId } = parseParams(
      legacyMembershipParamSchema,
      await params,
    );
    await addCollectionToGame(session.id, gameId, listId);
    return noContent();
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, listId } = parseParams(
      legacyMembershipParamSchema,
      await params,
    );
    await removeCollectionFromGame(session.id, gameId, listId);
    return noContent();
  });
}
