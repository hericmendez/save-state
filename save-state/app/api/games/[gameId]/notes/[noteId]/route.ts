import type { NextRequest } from "next/server";
import { handleRoute, noContent, ok } from "@/server/shared/route-handler";
import { parseBody, parseParams } from "@/server/shared/validation";
import { noteIdParamSchema, updateNoteSchema } from "@/schemas/notes";
import { getSessionUser } from "@/server/auth/session";
import { deleteNote, updateNote } from "@/server/notes/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ gameId: string; noteId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, noteId } = parseParams(noteIdParamSchema, await params);
    const body = parseBody(updateNoteSchema, await request.json());
    return ok(await updateNote(session.id, gameId, noteId, body));
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId, noteId } = parseParams(noteIdParamSchema, await params);
    await deleteNote(session.id, gameId, noteId);
    return noContent();
  });
}
