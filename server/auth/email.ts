import "server-only";
import { loadServerEnv } from "@/lib/env";

export interface EmailOptions { to: string; subject: string; text: string; html?: string }
export interface EmailService { send(options: EmailOptions): Promise<void> }

class ResendEmailService implements EmailService {
  async send(options: EmailOptions): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    const env = loadServerEnv();
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      throw new Error("Transactional email is not configured");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, ...options }),
      });
      if (!response.ok) throw new Error(`Email provider rejected request (${response.status})`);
    } finally { clearTimeout(timeout); }
  }
}

export const emailService: EmailService = new ResendEmailService();
