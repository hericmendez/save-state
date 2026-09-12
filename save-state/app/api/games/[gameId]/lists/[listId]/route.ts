import type { NextRequest } from "next/server";
import { handleRoute, noContent } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { gameIdAndListIdParamSchema } from "@/schemas/lists";
import { getSessionUser } from "@/server/auth/session";
import {
  addListToGame,
  removeListFromGame,
} from "@/server/lists/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ gameId: string; listId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, listId } = parseParams(
      gameIdAndListIdParamSchema,
      await params,
    );
    await addListToGame(session.id, gameId, listId);
    return noContent();
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, listId } = parseParams(
      gameIdAndListIdParamSchema,
      await params,
    );
    await removeListFromGame(session.id, gameId, listId);
    return noContent();
  });
}
