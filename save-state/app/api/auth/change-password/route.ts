import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { changePasswordSchema } from "@/schemas/auth";
import {
  CHANGE_PASSWORD_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import { getSessionUser } from "@/server/auth/session";
import { changePassword } from "@/server/auth/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    checkRateLimit(
      request,
      "POST /api/auth/change-password",
      CHANGE_PASSWORD_RATE_LIMIT,
    );
    const body = parseBody(changePasswordSchema, await request.json());
    await changePassword(session.id, body.currentPassword, body.newPassword);
    return ok({ message: "Password changed successfully" });
  });
}
