/**
 * Auth application service. Behavior-preserving port of the legacy
 * Express auth service: same normalization, hashing, token, and
 * sessionVersion semantics.
 */

import "server-only";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/api-error";
import { loadServerEnv } from "@/lib/env";
import { connectDatabase } from "@/db/connection";
import { User, type UserDocument } from "@/db/models/user";
import { PasswordResetToken } from "@/db/models/password-reset-token";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import { emailService } from "@/server/auth/email";
import { withAuthTransaction } from "@/server/auth/transaction";
import { logger } from "@/server/shared/logger";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Public user representation. The legacy contract exposes `id`
 * (stringified `_id`) — not `_id` itself — alongside name and email.
 * Never includes passwordHash, sessionVersion, or token internals.
 */
export function toSafeUser(user: {
  _id: unknown;
  name: string;
  email: string;
}): SafeUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
  };
}

export interface VerificationEmailJob {
  to: string;
  rawToken: string;
}

export async function registerUserForPublicSignup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<VerificationEmailJob | null> {
  await connectDatabase();
  const email = input.email.trim().toLowerCase();
  // Keep valid existing-account requests on the same dominant CPU path as a
  // new registration. The discarded hash is never persisted or used to log in.
  const passwordHash = await bcrypt.hash(input.password, 10);
  const existing = await User.findOne({ email });
  if (existing) return null;

  let user: UserDocument;
  try {
    user = await User.create({
      name: input.name,
      email,
      passwordHash,
      emailVerifiedAt: null,
    });
  } catch (error) {
    // Concurrent double-register raced past the existence check above.
    // The unique email index resolves the winner. Do not classify unrelated
    // unique-index failures (or other database faults) as a duplicate email.
    if (isDuplicateEmailError(error)) return null;
    throw error;
  }
  return createVerificationEmailJob(user);
}

/** Legacy internal service entry point used by seed tooling and service tests. */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<UserDocument> {
  const job = await registerUserForPublicSignup(input);
  if (!job) {
    throw new ApiError("EMAIL_ALREADY_IN_USE", "Email is already in use", 400);
  }
  const user = await User.findOne({ email: input.email.trim().toLowerCase() });
  if (!user) throw new Error("Registered user could not be reloaded");
  const { APP_URL } = loadServerEnv();
  const url = new URL("/verify-email", APP_URL);
  url.searchParams.set("token", job.rawToken);
  await emailService.send({
    to: job.to,
    subject: "Confirme seu e-mail — Save State",
    text: `Confirme seu e-mail: ${url.toString()}\nEste link expira em 24 horas.`,
    html: `<p>Confirme seu e-mail no Save State.</p><p><a href="${url.toString()}">Confirmar e-mail</a></p><p>Este link expira em 24 horas.</p>`,
  });
  return user;
}

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;
function isDuplicateEmailError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const duplicate = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    message?: string;
  };
  return (
    duplicate.code === 11000 &&
    (duplicate.keyPattern?.email !== undefined ||
      duplicate.keyValue?.email !== undefined ||
      /index:\s*email_1\b/u.test(duplicate.message ?? ""))
  );
}

async function createVerificationEmailJob(
  user: UserDocument,
): Promise<VerificationEmailJob> {
  const raw = crypto.randomBytes(32).toString("hex");
  await EmailVerificationToken.create({
    tokenHash: hashToken(raw), userId: user._id,
    expiresAt: new Date(Date.now() + VERIFICATION_EXPIRY_MS),
  });
  return { to: user.email, rawToken: raw };
}

export async function verifyEmail(token: string): Promise<void> {
  await connectDatabase();
  await withAuthTransaction(async (session) => {
    const record = await EmailVerificationToken.findOneAndDelete({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    }, { session });
    if (!record) {
      throw new ApiError("INVALID_TOKEN", "Invalid or expired verification link", 400);
    }

    const user = await User.findOneAndUpdate(
      { _id: record.userId, emailVerifiedAt: null },
      { $set: { emailVerifiedAt: new Date() } },
      { session },
    );
    if (!user) {
      throw new ApiError("INVALID_TOKEN", "Invalid or expired verification link", 400);
    }

    // All outstanding links for this account are retired in the same commit.
    await EmailVerificationToken.deleteMany({ userId: record.userId }, { session });
  });
}

export async function resendVerification(
  email: string,
): Promise<VerificationEmailJob | null> {
  await connectDatabase();
  const user = await User.findOne({ email: email.toLowerCase(), emailVerifiedAt: null });
  if (!user) return null;
  return createVerificationEmailJob(user);
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<UserDocument> {
  await connectDatabase();
  const user = await User.findOne({ email: input.email.toLowerCase() });
  const passwordMatches =
    user !== null &&
    (await bcrypt.compare(input.password, user.passwordHash));

  if (!user || !passwordMatches || !user.emailVerifiedAt) {
    throw new ApiError("UNAUTHENTICATED", "Invalid credentials", 401);
  }

  return user;
}

export async function getUserById(
  userId: string,
): Promise<UserDocument | null> {
  await connectDatabase();
  return User.findById(userId);
}

export async function updateUserName(
  userId: string,
  name: string,
): Promise<UserDocument> {
  await connectDatabase();
  const user = await User.findByIdAndUpdate(
    userId,
    { name },
    { new: true, runValidators: true },
  );
  if (!user) {
    throw new ApiError("USER_NOT_FOUND", "User not found", 404);
  }
  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await connectDatabase();
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError("USER_NOT_FOUND", "User not found", 404);
  }

  const passwordMatches = await bcrypt.compare(
    currentPassword,
    user.passwordHash,
  );
  if (!passwordMatches) {
    throw new ApiError(
      "INVALID_PASSWORD",
      "Current password is incorrect",
      400,
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(userId, {
    passwordHash,
    $inc: { sessionVersion: 1 },
  });
}

/** Revoke every JWT issued with the user's current sessionVersion. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await connectDatabase();
  // MongoDB applies $inc atomically; simultaneous logout/password changes
  // each advance the version and invalidate all tokens from before them.
  await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } });
}

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function forgotPassword(email: string): Promise<void> {
  await connectDatabase();
  const user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await PasswordResetToken.create({
      tokenHash,
      userId: user._id,
      expiresAt,
    });

    const { APP_URL } = loadServerEnv();
    const resetUrl = new URL("/reset-password", APP_URL);
    resetUrl.searchParams.set("token", rawToken);
    await emailService.send({
      to: user.email,
      subject: "Password Reset Request",
      text: `You requested a password reset. Reset your password here: ${resetUrl.toString()}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
      html: `<p>You requested a password reset.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, ignore this email.</p>`,
    });
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await connectDatabase();
  const tokenHash = hashToken(token);

  // Preflight avoids an expensive bcrypt operation for invalid tokens. The
  // token is rechecked atomically inside the transaction after hashing.
  const candidate = await PasswordResetToken.findOne({
    tokenHash,
    used: false,
    expiresAt: { $gt: new Date() },
  }).select("_id userId").lean();
  if (!candidate) {
    throw new ApiError(
      "INVALID_TOKEN",
      "Invalid or expired reset token",
      400,
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const email = await withAuthTransaction(async (session) => {
    const resetToken = await PasswordResetToken.findOneAndUpdate({
      _id: candidate._id,
      tokenHash,
      used: false,
      expiresAt: { $gt: new Date() },
    }, { $set: { used: true } }, { new: true, session });
    if (!resetToken) {
      throw new ApiError(
        "INVALID_TOKEN",
        "Invalid or expired reset token",
        400,
      );
    }

    const updated = await User.findByIdAndUpdate(resetToken.userId, {
      $set: { passwordHash },
      $inc: { sessionVersion: 1 },
    }, { new: true, session }).select("email");
    if (!updated) {
      throw new ApiError("INVALID_TOKEN", "Invalid or expired reset token", 400);
    }

    // A successful reset retires every other link for the account atomically.
    await PasswordResetToken.deleteMany({
      userId: resetToken.userId,
      _id: { $ne: resetToken._id },
    }, { session });
    return updated.email;
  });

  // The password change is committed already. Provider failures must not
  // make the client believe the token was unused or the reset rolled back.
  try {
    await emailService.send({
      to: email,
      subject: "Senha alterada — Save State",
      text: "Sua senha foi alterada. Se você não fez essa alteração, entre em contato com o suporte.",
    });
  } catch (error) {
    try {
      logger.error("Password reset committed but notification failed", {
        name: error instanceof Error ? error.name : typeof error,
      });
    } catch {
      // A notification/logging failure cannot undo or falsify a committed reset.
    }
  }
}
