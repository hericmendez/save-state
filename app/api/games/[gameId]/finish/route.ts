import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { gameIdParamSchema } from "@/schemas/games";
import { getSessionUser } from "@/server/auth/session";
import { incrementTimesFinished } from "@/server/games/service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId } = parseParams(gameIdParamSchema, await params);
    const result = await incrementTimesFinished(session.id, gameId);
    return ok(result);
  });
}
