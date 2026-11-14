/**
 * Authentication-scoped Zod schemas.
 *
 * These belong to the auth domain (Phase 3). They import only Zod so that
 * future form boundaries can reuse them; they must never import
 * server-only modules (models, secrets, services).
 */

import { z } from "zod";

const internetEmail = z.string().trim().max(254).email().refine((value) => {
  const domain = value.slice(value.lastIndexOf("@") + 1);
  return domain.includes(".") && domain.split(".").every((part) => part.length > 0 && part.length <= 63);
}, "Enter a valid public email address");

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: internetEmail,
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: internetEmail,
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: internetEmail,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
