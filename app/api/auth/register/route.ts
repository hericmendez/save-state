import type { NextRequest } from "next/server";
import { handleRoute, created } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { registerSchema } from "@/schemas/auth";
import {
  AUTH_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import { registerUserForPublicSignup } from "@/server/auth/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    checkRateLimit(request, "POST /api/auth/register", AUTH_RATE_LIMIT);
    const body = parseBody(registerSchema, await request.json());
    // Signup no longer sends e-mail and does not depend on the provider.
    // Registration deliberately returns the same response for new and
    // already-registered addresses, so it cannot be used for enumeration.
    await registerUserForPublicSignup(body);
    return created({
      message:
        "Cadastro processado. Se os dados estiverem corretos, você já pode entrar com seu e-mail e senha.",
    });
  });
}
