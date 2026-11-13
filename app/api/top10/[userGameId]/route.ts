import type { NextRequest } from "next/server";
import { created, handleRoute, noContent } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { top10UserGameParamSchema } from "@/schemas/top10";
import { getSessionUser } from "@/server/auth/session";
import {
  addToTop10,
  removeFromTop10,
} from "@/server/top10/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ userGameId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { userGameId } = parseParams(top10UserGameParamSchema, await params);
    return created(await addToTop10(session.id, userGameId));
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { userGameId } = parseParams(top10UserGameParamSchema, await params);
    await removeFromTop10(session.id, userGameId);
    return noContent();
  });
}
