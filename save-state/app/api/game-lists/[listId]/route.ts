import type { NextRequest } from "next/server";
import { handleRoute, noContent, ok } from "@/server/shared/route-handler";
import { parseBody, parseParams } from "@/server/shared/validation";
import {
  listIdParamSchema,
  updateGameListSchema,
} from "@/schemas/lists";
import { getSessionUser } from "@/server/auth/session";
import {
  deleteGameList,
  getGameList,
  updateGameList,
} from "@/server/lists/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ listId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { listId } = parseParams(listIdParamSchema, await params);
    const list = await getGameList(session.id, listId);
    return ok(list.toObject());
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    // Legacy behavior: only the body is pre-validated here, so a malformed
    // id surfaces as INVALID_LIST_ID from the service layer.
    const { listId } = await params;
    const body = parseBody(updateGameListSchema, await request.json());
    const list = await updateGameList(session.id, listId, body);
    return ok(list.toObject());
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { listId } = parseParams(listIdParamSchema, await params);
    await deleteGameList(session.id, listId);
    return noContent();
  });
}
