import type { NextRequest } from "next/server";
import { created, handleRoute } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { searchImportSchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { importExternalGame } from "@/server/search/import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    // Accept the deprecated { atpId } body during the /api/atp/* →
// /api/search/* migration; new callers send { externalId }.
    const raw = await request.json();
    const legacy = z.object({ atpId: z.string().optional() }).safeParse(raw);
    const normalized =
      legacy.success && legacy.data.atpId && !("externalId" in (raw as object))
        ? { ...(raw as object), externalId: legacy.data.atpId }
        : raw;
    const parsed = parseBody(searchImportSchema, normalized);
    // The active provider determines origin and flow: ATP reuses the
    // atpDomainId snapshot path; IGDB persists source "igdb" + igdbId.
    return created(await importExternalGame(session.id, parsed));
  });
}
