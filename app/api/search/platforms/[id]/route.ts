import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { searchIdParamSchema } from "@/schemas/search";
import { getSessionUser } from "@/server/auth/session";
import { getSearchProvider } from "@/server/search/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const { id } = parseParams(searchIdParamSchema, await params);
    return ok(await getSearchProvider().getPlatform(id));
  });
}
