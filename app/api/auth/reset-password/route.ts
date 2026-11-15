import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { resetPasswordSchema } from "@/schemas/auth";
import {
  RESET_PASSWORD_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import { resetPassword } from "@/server/auth/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    checkRateLimit(
      request,
      "POST /api/auth/reset-password",
      RESET_PASSWORD_RATE_LIMIT,
    );
    const body = parseBody(resetPasswordSchema, await request.json());
    await resetPassword(body.token, body.password);
    return ok({ message: "Password has been reset" });
  });
}
