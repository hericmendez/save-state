import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { searchExternalIdSchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { z } from "zod";

export const runtime = "nodejs";

const externalIdRouteParamSchema = z.object({
  externalId: searchExternalIdSchema,
});

interface RouteContext {
  params: Promise<{ externalId: string }>;
}

/**
 * Neutral catalog→library bridge (Etapa 4).
 *
 * Resolves the active catalog identity on Save State's side: an IGDB
 * numeric id matches igdbId, an ATP id matches atpDomainId. The frontend
 * calls this with the neutral card id and never chooses a provider.
 * Never sends an IGDB id to an ATP-scoped lookup or vice versa — the
 * $or below reads Save State's own GlobalGame collection only.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { externalId } = externalIdRouteParamSchema.parse(await params);
    await connectDatabase();
    const numeric = /^[0-9]{1,10}$/.test(externalId)
      ? Number(externalId)
      : undefined;
    const globalGame = await GlobalGame.findOne({
      $or: [
        ...(numeric !== undefined ? [{ igdbId: numeric }] : []),
        { atpDomainId: externalId },
      ],
    }).lean();
    if (!globalGame) {
      throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
    }
    const userGame = await UserGame.findOne({
      userId: new Types.ObjectId(session.id),
      gameId: globalGame._id,
    }).populate("gameId");
    if (!userGame) {
      throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
    }
    const obj = userGame.toObject() as unknown as Record<string, unknown>;
    // Mirror getGame shape: { ...userGame, game: populated GlobalGame }
    const populated = (userGame as unknown as { gameId: unknown }).gameId;
    return ok({ ...obj, game: populated });
  });
}
