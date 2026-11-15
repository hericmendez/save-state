import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { updateMeSchema } from "@/schemas/auth";
import { ApiError } from "@/lib/api-error";
import { getSessionUser } from "@/server/auth/session";
import {
  getUserById,
  toSafeUser,
  updateUserName,
} from "@/server/auth/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const user = await getUserById(session.id);
    if (!user) {
      throw new ApiError(
        "USER_NOT_FOUND",
        "Authenticated user no longer exists",
        404,
      );
    }
    return ok(toSafeUser(user));
  });
}

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const body = parseBody(updateMeSchema, await request.json());
    const user = await updateUserName(session.id, body.name);
    return ok(toSafeUser(user));
  });
}
