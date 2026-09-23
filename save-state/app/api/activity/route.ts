import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import { parseQuery, searchParamsToObject } from "@/server/shared/validation";
import { feedQuerySchema } from "@/schemas/activity";
import { getSessionUser } from "@/server/auth/session";
import { listFeed } from "@/server/activity/service";

export const runtime = "nodejs";

/**
 * Read-only Activity Feed. Append-only diary: no POST/PUT/PATCH/DELETE
 * exists under this path by design.
 */
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const query = parseQuery(
      feedQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    // Paginated collection: envelope returned directly, same as games/lists.
    return NextResponse.json(await listFeed(session.id, query), { status: 200 });
  });
}
