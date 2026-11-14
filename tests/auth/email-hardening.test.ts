import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as resendVerificationRoute } from "@/app/api/auth/resend-verification/route";
import { POST as forgotPasswordRoute } from "@/app/api/auth/forgot-password/route";
import {
  forgotPassword,
  resendVerification,
} from "@/server/auth/service";
import {
  EmailDeliveryError,
  classifyEmailFailure,
  emailService,
  isTransactionalEmailConfigured,
} from "@/server/auth/email";
import { User } from "@/db/models/user";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import { PasswordResetToken } from "@/db/models/password-reset-token";
import { __resetRateLimitBuckets } from "@/server/auth/rate-limit";
import { logger } from "@/server/shared/logger";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  __resetRateLimitBuckets();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const MAIL_KEYS = ["NODE_ENV", "RESEND_API_KEY", "EMAIL_FROM"] as const;

async function withMailUnavailable<T>(run: () => Promise<T>): Promise<T> {
  const saved = new Map(MAIL_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  try {
    return await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else Object.assign(process.env, { [key]: value });
    }
  }
}

async function withMailConfigured<T>(run: () => Promise<T>): Promise<T> {
  const saved = new Map(MAIL_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Save State <no-reply@test.local>";
  try {
    return await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else Object.assign(process.env, { [key]: value });
    }
  }
}

describe("email configuration detection", () => {
  it("keeps tests runnable without provider credentials", () => {
    expect(isTransactionalEmailConfigured({ NODE_ENV: "test" })).toBe(true);
  });

  it("requires both API key and sender outside tests", () => {
    expect(isTransactionalEmailConfigured({ NODE_ENV: "production" })).toBe(false);
    expect(isTransactionalEmailConfigured({
      NODE_ENV: "production",
      RESEND_API_KEY: "key",
    })).toBe(false);
    expect(isTransactionalEmailConfigured({
      NODE_ENV: "production",
      EMAIL_FROM: "no-reply@test.local",
    })).toBe(false);
    expect(isTransactionalEmailConfigured({
      NODE_ENV: "production",
      RESEND_API_KEY: "   ",
      EMAIL_FROM: "no-reply@test.local",
    })).toBe(false);
    expect(isTransactionalEmailConfigured({
      NODE_ENV: "production",
      RESEND_API_KEY: "key",
      EMAIL_FROM: "no-reply@test.local",
    })).toBe(true);
  });

  it("classifies failures without reading their payload", () => {
    expect(classifyEmailFailure(new EmailDeliveryError("EMAIL_NOT_CONFIGURED")))
      .toBe("EMAIL_NOT_CONFIGURED");
    expect(classifyEmailFailure(new EmailDeliveryError("EMAIL_PROVIDER_REJECTED")))
      .toBe("EMAIL_PROVIDER_REJECTED");
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyEmailFailure(abort)).toBe("EMAIL_PROVIDER_TIMEOUT");
    expect(classifyEmailFailure(new TypeError("fetch failed"))).toBe("EMAIL_NETWORK_ERROR");
    expect(classifyEmailFailure(new Error("boom"))).toBe("EMAIL_UNKNOWN_ERROR");
  });
});

describe("provider classification without network", () => {
  it("maps a rejected response to EMAIL_PROVIDER_REJECTED", async () => {
    await withMailConfigured(async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response("provider body must not be logged", { status: 422 }),
      ));
      await expect(emailService.send({
        to: "recipient@test.local",
        subject: "s",
        text: "t",
      })).rejects.toMatchObject({ category: "EMAIL_PROVIDER_REJECTED" });
    });
  });

  it("maps a fetch failure to EMAIL_NETWORK_ERROR", async () => {
    await withMailConfigured(async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
      await expect(emailService.send({
        to: "recipient@test.local",
        subject: "s",
        text: "t",
      })).rejects.toMatchObject({ category: "EMAIL_NETWORK_ERROR" });
    });
  });

  it("maps an abort to EMAIL_PROVIDER_TIMEOUT", async () => {
    await withMailConfigured(async () => {
      const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
      await expect(emailService.send({
        to: "recipient@test.local",
        subject: "s",
        text: "t",
      })).rejects.toMatchObject({ category: "EMAIL_PROVIDER_TIMEOUT" });
    });
  });
});

const REGISTRATION_MESSAGE =
  "Cadastro processado. Se os dados estiverem corretos, você já pode entrar com seu e-mail e senha.";

describe("signup independence from transactional email", () => {
  it("creates the account with mail unavailable, without sending or storing a token", async () => {
    const save = vi.spyOn(User.prototype, "save");
    const createToken = vi.spyOn(EmailVerificationToken, "create");
    const send = vi.spyOn(emailService, "send");

    const response = await withMailUnavailable(() => register(
      postRequest("/api/auth/register", TEST_USER),
    ));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { message: REGISTRATION_MESSAGE } });
    expect(save).toHaveBeenCalledTimes(1);
    expect(createToken).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeNull();
  });

  it("sends nothing even when the provider is configured", async () => {
    const send = vi.spyOn(emailService, "send");

    const response = await withMailConfigured(() => register(
      postRequest("/api/auth/register", TEST_USER),
    ));

    expect(response.status).toBe(201);
    expect(send).not.toHaveBeenCalled();
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
    expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeNull();
  });

  it("keeps the same 201 response for an already-registered address", async () => {
    const first = await withMailUnavailable(() => register(
      postRequest("/api/auth/register", TEST_USER),
    ));
    const firstBody = await first.json();
    const second = await withMailUnavailable(() => register(postRequest(
      "/api/auth/register",
      { ...TEST_USER, name: "Another Name", password: "different-password-456" },
    )));
    const secondBody = await second.json();

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(secondBody).toEqual(firstBody);
    expect(await User.countDocuments({ email: TEST_USER.email })).toBe(1);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
  });
});

describe("single-document registration consistency", () => {
  it("creates no user or token when the user write fails", async () => {
    vi.spyOn(User.prototype, "save").mockRejectedValueOnce(
      new Error("synthetic user write failure"),
    );
    const send = vi.spyOn(emailService, "send");

    const response = await register(postRequest("/api/auth/register", TEST_USER));

    expect(response.status).toBe(500);
    expect(await User.countDocuments({ email: TEST_USER.email })).toBe(0);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps one user and a uniform 201 for concurrent duplicate signups", async () => {
    const [first, second] = await Promise.all([
      register(postRequest("/api/auth/register", TEST_USER)),
      register(postRequest("/api/auth/register", TEST_USER)),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 201]);
    expect(await User.countDocuments({ email: TEST_USER.email })).toBe(1);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
  });
});

describe("uniform password-recovery behavior", () => {
  it("returns the generic 200 and writes no reset token when mail is unavailable", async () => {
    const create = vi.spyOn(PasswordResetToken, "create");
    const errorLog = vi.spyOn(logger, "error");

    const response = await withMailUnavailable(() => forgotPasswordRoute(
      postRequest("/api/auth/forgot-password", { email: TEST_USER.email }),
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "If an account exists, a reset email has been sent" },
    });
    expect(create).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("Password reset email unavailable", {
      category: "EMAIL_NOT_CONFIGURED",
    });
  });

  it("keeps 200 when the provider rejects a reset email", async () => {
    const registerResponse = await register(postRequest("/api/auth/register", TEST_USER));
    expect(registerResponse.status).toBe(201);
    // Recovery does not require the address to have been confirmed; this also
    // documents the unverified-identifier risk in the hybrid model.
    expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeNull();
    const errorLog = vi.spyOn(logger, "error");
    vi.spyOn(emailService, "send").mockRejectedValue(
      new EmailDeliveryError("EMAIL_PROVIDER_REJECTED"),
    );

    const response = await forgotPasswordRoute(
      postRequest("/api/auth/forgot-password", { email: TEST_USER.email }),
    );

    expect(response.status).toBe(200);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
    expect(errorLog).toHaveBeenCalledWith("Password reset email delivery failed", {
      category: "EMAIL_PROVIDER_REJECTED",
      name: "EmailDeliveryError",
    });
  });

  it("returns the generic 200 and writes no token when resend mail is unavailable", async () => {
    const create = vi.spyOn(EmailVerificationToken, "create");
    const errorLog = vi.spyOn(logger, "error");

    const response = await withMailUnavailable(() => resendVerificationRoute(
      postRequest("/api/auth/resend-verification", { email: TEST_USER.email }),
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "If the account is pending, a verification email will be sent" },
    });
    expect(create).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("Verification resend unavailable", {
      category: "EMAIL_NOT_CONFIGURED",
    });
  });

  it("returns null from the resend service without touching the database", async () => {
    const find = vi.spyOn(User, "findOne");
    const result = await withMailUnavailable(() => resendVerification(TEST_USER.email));
    expect(result).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("keeps the forgotPassword service silent for unknown and existing addresses", async () => {
    await withMailUnavailable(async () => {
      await expect(forgotPassword("nobody@test.com")).resolves.toBeUndefined();
      await expect(forgotPassword(TEST_USER.email)).resolves.toBeUndefined();
    });
  });
});
