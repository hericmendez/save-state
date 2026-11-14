import "server-only";

export interface EmailOptions { to: string; subject: string; text: string; html?: string }
export interface EmailService { send(options: EmailOptions): Promise<void> }

/**
 * Sanitized classification for transactional-email failures. These values are
 * safe to log: they never contain credentials, recipients, tokens, links,
 * provider payloads, or raw responses.
 */
export type EmailFailureCategory =
  | "EMAIL_NOT_CONFIGURED"
  | "EMAIL_PROVIDER_REJECTED"
  | "EMAIL_PROVIDER_TIMEOUT"
  | "EMAIL_NETWORK_ERROR"
  | "EMAIL_UNKNOWN_ERROR";

export class EmailDeliveryError extends Error {
  readonly category: EmailFailureCategory;

  constructor(category: EmailFailureCategory, message: string = category) {
    super(message);
    this.name = "EmailDeliveryError";
    this.category = category;
  }
}

/**
 * Central availability check. In tests the send path is a deliberate no-op, so
 * tests remain runnable without provider credentials. Every other environment
 * must have both the API key and the sender configured before the application
 * may persist a new account that depends on a verification e-mail.
 */
export function isTransactionalEmailConfigured(
  source: Record<string, string | undefined> = process.env,
): boolean {
  if (source.NODE_ENV === "test") return true;
  const apiKey = source.RESEND_API_KEY?.trim();
  const sender = source.EMAIL_FROM?.trim();
  return Boolean(apiKey && sender);
}

/** Map a thrown value to a sanitized category without reading its payload. */
export function classifyEmailFailure(error: unknown): EmailFailureCategory {
  if (error instanceof EmailDeliveryError) return error.category;
  if (error instanceof Error) {
    if (error.name === "AbortError") return "EMAIL_PROVIDER_TIMEOUT";
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|network/iu.test(error.message)) {
      return "EMAIL_NETWORK_ERROR";
    }
  }
  return "EMAIL_UNKNOWN_ERROR";
}

/** Log-safe fields only: category plus the error class name. */
export function emailFailureLogFields(error: unknown): {
  category: EmailFailureCategory;
  name: string;
} {
  return {
    category: classifyEmailFailure(error),
    name: error instanceof Error ? error.name : typeof error,
  };
}

class ResendEmailService implements EmailService {
  async send(options: EmailOptions): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    if (!isTransactionalEmailConfigured()) {
      throw new EmailDeliveryError("EMAIL_NOT_CONFIGURED");
    }
    const apiKey = process.env.RESEND_API_KEY!.trim();
    const sender = process.env.EMAIL_FROM!.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender, ...options }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new EmailDeliveryError("EMAIL_PROVIDER_TIMEOUT");
      }
      throw new EmailDeliveryError("EMAIL_NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      // Status is safe to keep in the message, but callers log only category/name.
      throw new EmailDeliveryError(
        "EMAIL_PROVIDER_REJECTED",
        `Email provider rejected request (${response.status})`,
      );
    }
  }
}

export const emailService: EmailService = new ResendEmailService();
