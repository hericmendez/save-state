import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { atpIdSchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { z } from "zod";

export const runtime = "nodejs";

const atpIdRouteParamSchema = z.object({ atpId: atpIdSchema });

interface RouteContext {
  params: Promise<{ atpId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { atpId } = atpIdRouteParamSchema.parse(await params);
    await connectDatabase();
    const globalGame = await GlobalGame.findOne({ atpDomainId: atpId }).lean();
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
