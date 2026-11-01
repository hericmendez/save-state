import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { searchIdParamSchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { getCatalogDetail } from "@/server/search/catalog-reads";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { id } = parseParams(searchIdParamSchema, await params);
    // Cover resolves here so the preview shows it immediately; a missing
    // cover degrades to null instead of failing the preview.
    return ok(await getCatalogDetail(id, session.id));
  });
}
