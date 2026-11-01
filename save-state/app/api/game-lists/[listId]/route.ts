import type { NextRequest } from "next/server";
import { handleRoute, noContent, ok } from "@/server/shared/route-handler";
import { parseBody, parseParams } from "@/server/shared/validation";
import { objectIdSchema } from "@/schemas/games";
import { updateGameCollectionSchema } from "@/schemas/collections";
import { getSessionUser } from "@/server/auth/session";
import {
  deleteGameCollection,
  getGameCollection,
  updateGameCollection,
} from "@/server/collections/service";
import { z } from "zod";

/**
 * Legacy Lists API — temporary compatibility adapter (Etapa 6).
 * Translates listId → collectionId and delegates; prefer
 * /api/game-collections/[collectionId].
 */
export const runtime = "nodejs";

const legacyListIdParamSchema = z.object({ listId: objectIdSchema });

interface RouteContext {
  params: Promise<{ listId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { listId } = parseParams(legacyListIdParamSchema, await params);
    const collection = await getGameCollection(session.id, listId);
    return ok(collection.toObject());
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    // Legacy behavior: only the body is pre-validated here, so a malformed
    // id surfaces as INVALID_LIST_ID from the service layer.
    const { listId } = await params;
    const body = parseBody(updateGameCollectionSchema, await request.json());
    const collection = await updateGameCollection(session.id, listId, body);
    return ok(collection.toObject());
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { listId } = parseParams(legacyListIdParamSchema, await params);
    await deleteGameCollection(session.id, listId);
    return noContent();
  });
}
