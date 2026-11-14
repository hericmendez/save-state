import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { z } from "zod";
import { verifyEmail } from "@/server/auth/service";
import { checkRateLimit, RESET_PASSWORD_RATE_LIMIT } from "@/server/auth/rate-limit";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return handleRoute(async () => { checkRateLimit(request, "verify-email", RESET_PASSWORD_RATE_LIMIT); const { token } = parseBody(z.object({ token: z.string().min(1).max(256) }), await request.json()); await verifyEmail(token); return ok({ message: "Email verified" }); }); }
