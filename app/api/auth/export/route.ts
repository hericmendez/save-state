import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import { getSessionUser } from "@/server/auth/session";
import { buildExportPayload } from "@/server/export/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const payload = await buildExportPayload(session.id);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="save-state-export-${payload.user.id}.json"`,
      },
    });
  });
}
