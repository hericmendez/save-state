import type { NextRequest } from "next/server";
import { handleRoute, noContent, ok } from "@/server/shared/route-handler";
import { parseBody, parseParams } from "@/server/shared/validation";
import {
  collectionIdParamSchema,
  updateGameCollectionSchema,
} from "@/schemas/collections";
import { getSessionUser } from "@/server/auth/session";
import {
  deleteGameCollection,
  getGameCollection,
  updateGameCollection,
} from "@/server/collections/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ collectionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { collectionId } = parseParams(collectionIdParamSchema, await params);
    const collection = await getGameCollection(session.id, collectionId);
    return ok(collection.toObject());
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    // Legacy behavior: only the body is pre-validated here, so a malformed
    // id surfaces as INVALID_LIST_ID from the service layer.
    const { collectionId } = await params;
    const body = parseBody(updateGameCollectionSchema, await request.json());
    const collection = await updateGameCollection(session.id, collectionId, body);
    return ok(collection.toObject());
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { collectionId } = parseParams(collectionIdParamSchema, await params);
    await deleteGameCollection(session.id, collectionId);
    return noContent();
  });
}
