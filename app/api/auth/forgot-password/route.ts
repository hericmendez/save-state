import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { forgotPasswordSchema } from "@/schemas/auth";
import {
  FORGOT_PASSWORD_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import { forgotPassword } from "@/server/auth/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    checkRateLimit(
      request,
      "POST /api/auth/forgot-password",
      FORGOT_PASSWORD_RATE_LIMIT,
    );
    const body = parseBody(forgotPasswordSchema, await request.json());
    await forgotPassword(body.email);
    // Generic response regardless of account existence (anti-enumeration).
    return ok({ message: "If an account exists, a reset email has been sent" });
  });
}
