/**
 * Development email channel. Mirrors the legacy console behavior so the
 * reset flow stays observable without a provider, per ADR-020 (the real
 * provider decision is deferred to Phase 3 completion and beyond).
 *
 * Deliberate, documented difference from legacy: the message body — which
 * contains the raw reset token — is NOT written to logs. Only the
 * recipient and subject are logged. Reset tokens must never appear in
 * API responses or logs.
 */

import "server-only";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  send(options: EmailOptions): Promise<void>;
}

class ConsoleEmailService implements EmailService {
  async send(options: EmailOptions): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    console.log(`[EmailService] Sending email to: ${options.to}`);
    console.log(`[EmailService] Subject: ${options.subject}`);
  }
}

export const emailService: EmailService = new ConsoleEmailService();
