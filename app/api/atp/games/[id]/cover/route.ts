import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { atpIdParamSchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { getAtpGameCover } from "@/server/atp/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const { id } = parseParams(atpIdParamSchema, await params);
    // Lazy cover: missing covers degrade to null, never fail the caller.
    const cover = await getAtpGameCover(id).catch(() => null);
    return ok({ coverUrl: cover?.url ?? null, cover });
  });
}
