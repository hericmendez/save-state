import "server-only";
import { after } from "next/server";
import { loadServerEnv } from "@/lib/env";
import { emailService, type EmailOptions } from "@/server/auth/email";
import type { VerificationEmailJob } from "@/server/auth/service";
import { logger } from "@/server/shared/logger";

function toEmailOptions(job: VerificationEmailJob): EmailOptions {
  const { APP_URL } = loadServerEnv();
  const url = new URL("/verify-email", APP_URL);
  url.searchParams.set("token", job.rawToken);
  return {
    to: job.to,
    subject: "Confirme seu e-mail — Save State",
    text: `Confirme seu e-mail: ${url.toString()}\nEste link expira em 24 horas.`,
    html: `<p>Confirme seu e-mail no Save State.</p><p><a href="${url.toString()}">Confirmar e-mail</a></p><p>Este link expira em 24 horas.</p>`,
  };
}

/** Delivery/configuration failures are observed server-side, never in the public signup response. */
export async function deliverVerificationEmail(
  job: VerificationEmailJob | null,
): Promise<void> {
  if (!job) return;
  try {
    await emailService.send(toEmailOptions(job));
  } catch (error) {
    try {
      logger.error("Verification email delivery failed", {
        name: error instanceof Error ? error.name : typeof error,
      });
    } catch {
      // A logging failure must not turn a deferred notification into a route error.
    }
  }
}

/**
 * Schedule verification delivery outside the public response. The test-only
 * branch is needed because Route Handlers are invoked directly by Vitest,
 * outside Next's request AsyncLocalStorage scope.
 */
export async function scheduleVerificationEmail(
  job: VerificationEmailJob | null,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    await deliverVerificationEmail(job);
    return;
  }
  after(() => deliverVerificationEmail(job));
}
