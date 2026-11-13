import { type NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { reorderTop10Schema } from "@/schemas/top10";
import { getSessionUser } from "@/server/auth/session";
import { getTop10, reorderTop10 } from "@/server/top10/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    return ok(await getTop10(session.id));
  });
}

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const body = parseBody(reorderTop10Schema, await request.json());
    return ok(await reorderTop10(session.id, body.top10));
  });
}

