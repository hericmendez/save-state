import type { NextRequest } from "next/server";
import { handleRoute, created } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { registerSchema } from "@/schemas/auth";
import {
  AUTH_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import { registerUserForPublicSignup } from "@/server/auth/service";
import { scheduleVerificationEmail } from "@/server/auth/verification-email";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    checkRateLimit(request, "POST /api/auth/register", AUTH_RATE_LIMIT);
    const body = parseBody(registerSchema, await request.json());
    const verificationEmail = await registerUserForPublicSignup(body);
    await scheduleVerificationEmail(verificationEmail);
    // This response is intentionally identical for new, pending, and verified
    // addresses. It does not confirm delivery or create an authenticated session.
    return created({
      message:
        "Se o endereço puder receber uma confirmação, enviaremos instruções. Verifique sua caixa de entrada ou solicite outro link.",
    });
  });
}
