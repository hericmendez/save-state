import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseBody } from "@/server/shared/validation";
import { forgotPasswordSchema } from "@/schemas/auth";
import { checkRateLimit, FORGOT_PASSWORD_RATE_LIMIT } from "@/server/auth/rate-limit";
import { resendVerification } from "@/server/auth/service";
import { scheduleVerificationEmail } from "@/server/auth/verification-email";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return handleRoute(async () => { checkRateLimit(request, "resend-verification", FORGOT_PASSWORD_RATE_LIMIT); const { email } = parseBody(forgotPasswordSchema, await request.json()); const verificationEmail = await resendVerification(email); await scheduleVerificationEmail(verificationEmail); return ok({ message: "If the account is pending, a verification email will be sent" }); }); }
