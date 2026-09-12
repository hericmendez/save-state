import type { NextRequest } from "next/server";
import { handleRoute, noContent, ok } from "@/server/shared/route-handler";
import { parseBody, parseParams } from "@/server/shared/validation";
import { gameIdParamSchema, updateGameSchema } from "@/schemas/games";
import { getSessionUser } from "@/server/auth/session";
import { deleteGame, getGame, updateGame } from "@/server/games/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ gameId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId } = parseParams(gameIdParamSchema, await params);
    return ok(await getGame(session.id, gameId));
  });
}

async function update(request: NextRequest, context: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    // Legacy behavior: PATCH and PUT share validation (body only) and the
    // same service. Params are not pre-validated here, so a malformed id
    // surfaces as INVALID_GAME_ID from the service layer.
    const { gameId } = await context.params;
    const body = parseBody(updateGameSchema, await request.json());
    return ok(await updateGame(session.id, gameId, body));
  });
}

// PATCH and PUT are semantically equivalent in the legacy API; both are
// preserved as separate handlers sharing the update service.
export async function PATCH(request: NextRequest, context: RouteContext) {
  return update(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return update(request, context);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId } = parseParams(gameIdParamSchema, await params);
    await deleteGame(session.id, gameId);
    return noContent();
  });
}
