import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, created } from "@/server/shared/route-handler";
import {
  parseBody,
  parseParams,
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { gameIdParamSchema } from "@/schemas/games";
import {
  createNoteSchema,
  listNotesQuerySchema,
} from "@/schemas/notes";
import { getSessionUser } from "@/server/auth/session";
import { createNote, listNotes } from "@/server/notes/service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ gameId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId } = parseParams(gameIdParamSchema, await params);
    const query = parseQuery(
      listNotesQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    return NextResponse.json(await listNotes(session.id, gameId, query), {
      status: 200,
    });
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { gameId } = parseParams(gameIdParamSchema, await params);
    const body = parseBody(createNoteSchema, await request.json());
    return created(await createNote(session.id, gameId, body));
  });
}
