import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { loginSchema } from "@/schemas/auth";
import {
  AUTH_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import { loginUser, toSafeUser } from "@/server/auth/service";
import { setAuthCookie, signToken } from "@/server/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    checkRateLimit(request, "POST /api/auth/login", AUTH_RATE_LIMIT);
    const body = parseBody(loginSchema, await request.json());
    const user = await loginUser(body);
    const token = signToken({
      userId: String(user._id),
      sessionVersion: user.sessionVersion,
    });
    const response = ok(toSafeUser(user));
    setAuthCookie(response, token);
    return response;
  });
}
