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
import { emailService } from "@/server/auth/email";

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

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<UserDocument> {
  await connectDatabase();
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw new ApiError(
      "EMAIL_ALREADY_IN_USE",
      "Email is already in use",
      400,
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  return User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash,
  });
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

  if (!user || !passwordMatches) {
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

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function forgotPassword(email: string): Promise<void> {
  await connectDatabase();
  const user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    await PasswordResetToken.deleteMany({ userId: user._id });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await PasswordResetToken.create({
      tokenHash,
      userId: user._id,
      expiresAt,
    });

    const { APP_URL } = loadServerEnv();
    const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`;
    await emailService.send({
      to: user.email,
      subject: "Password Reset Request",
      text: `You requested a password reset. Reset your password here: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
      html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, ignore this email.</p>`,
    });
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await connectDatabase();
  const tokenHash = hashToken(token);

  const resetToken = await PasswordResetToken.findOne({
    tokenHash,
    used: false,
    expiresAt: { $gt: new Date() },
  });

  if (!resetToken) {
    throw new ApiError(
      "INVALID_TOKEN",
      "Invalid or expired reset token",
      400,
    );
  }

  resetToken.used = true;
  await resetToken.save();

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(resetToken.userId, {
    passwordHash,
    $inc: { sessionVersion: 1 },
  });
}
