import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { getSessionUser } from "@/server/auth/session";
import { getSearchProvider } from "@/server/search/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    return ok(await getSearchProvider().listFamilies());
  });
}
