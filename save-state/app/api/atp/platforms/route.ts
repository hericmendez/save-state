import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { atpPlatformsQuerySchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { listAtpPlatforms } from "@/server/atp/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const query = parseQuery(
      atpPlatformsQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await listAtpPlatforms(query);
    return NextResponse.json(
      {
        data: result.data,
        pagination: result.pagination,
      },
      { status: 200 },
    );
  });
}
