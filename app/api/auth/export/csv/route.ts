import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import { getSessionUser } from "@/server/auth/session";
import { buildExportPayload, exportToCsv } from "@/server/export/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const payload = await buildExportPayload(session.id);
    const csv = exportToCsv(payload);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="save-state-export-${payload.user.id}.csv"`,
      },
    });
  });
}
