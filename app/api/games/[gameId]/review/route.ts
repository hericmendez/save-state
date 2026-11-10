import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { gameIdParamSchema } from "@/schemas/games";
import { getSessionUser } from "@/server/auth/session";
import { getReview } from "@/server/reviews/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ gameId: string }>;
}

/**
 * GET /api/games/:gameId/review — on-demand full review content.
 * Never embedded in list/get responses; surfaces keep using the
 * `reviewExcerpt` preview. 404 (REVIEW_NOT_FOUND) when absent.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId } = parseParams(gameIdParamSchema, await params);
    return ok(await getReview(session.id, gameId));
  });
}
