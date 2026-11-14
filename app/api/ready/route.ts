import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkDatabaseReadiness } from "@/db/readiness";
import { logger } from "@/server/shared/logger";

export const runtime = "nodejs";

function hasMonitoringAuthorization(request: NextRequest): boolean {
  const expected = process.env.READINESS_PROBE_TOKEN;
  if (!expected || expected.length < 32) return false;

  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(match[1], "utf8");
  return expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes);
}

function unavailable(status: number) {
  return NextResponse.json(
    { status: "unavailable" },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!hasMonitoringAuthorization(request)) return unavailable(404);

  try {
    await checkDatabaseReadiness();
    return NextResponse.json(
      { status: "ready" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Avoid returning driver messages, database names, URI, or credentials.
    logger.error("MongoDB readiness probe failed", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return unavailable(503);
  }
}
