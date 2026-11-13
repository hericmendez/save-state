import type { NextRequest } from "next/server";
import { created, handleRoute } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { atpImportSchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { importAtpGame } from "@/server/atp/import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const body = parseBody(atpImportSchema, await request.json());
    return created(await importAtpGame(session.id, body));
  });
}
