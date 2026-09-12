import type { NextRequest } from "next/server";
import { handleRoute, created } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { registerSchema } from "@/schemas/auth";
import {
  AUTH_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import { registerUser, toSafeUser } from "@/server/auth/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    checkRateLimit(request, "POST /api/auth/register", AUTH_RATE_LIMIT);
    const body = parseBody(registerSchema, await request.json());
    const user = await registerUser(body);
    // Legacy behavior: registration does NOT establish a session cookie.
    return created(toSafeUser(user));
  });
}
