import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as resendVerification } from "@/app/api/auth/resend-verification/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import { PasswordResetToken } from "@/db/models/password-reset-token";
import { User } from "@/db/models/user";
import { emailService } from "@/server/auth/email";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  markTestUserVerified,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);
afterEach(() => vi.restoreAllMocks());

async function registerAndCaptureVerificationToken(): Promise<string> {
  let rawToken = "";
  const send = vi.spyOn(emailService, "send").mockImplementation(async ({ text }) => {
    rawToken = /token=([^\s]+)/u.exec(text)?.[1] ?? "";
  });
  try {
    const response = await register(postRequest("/api/auth/register", TEST_USER));
    expect(response.status).toBe(201);
  } finally {
    send.mockRestore();
  }
  if (!rawToken) throw new Error("verification token was not captured");
  return rawToken;
}

async function createResetToken(): Promise<string> {
  let rawToken = "";
  const send = vi.spyOn(emailService, "send").mockImplementation(async ({ text }) => {
    rawToken = /token=([0-9a-f]{64})/u.exec(text)?.[1] ?? "";
  });
  try {
    const response = await forgotPassword(postRequest("/api/auth/forgot-password", {
      email: TEST_USER.email,
    }));
    expect(response.status).toBe(200);
  } finally {
    send.mockRestore();
  }
  if (!rawToken) throw new Error("reset token was not captured");
  return rawToken;
}

async function createVerifiedUser(): Promise<void> {
  const response = await register(postRequest("/api/auth/register", TEST_USER));
  expect(response.status).toBe(201);
  await markTestUserVerified(TEST_USER.email);
}

async function loginToken(): Promise<string> {
  const response = await login(postRequest("/api/auth/login", {
    email: TEST_USER.email,
    password: TEST_USER.password,
  }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

describe("transactional email verification tokens", () => {
  it("rolls token consumption back if the user update fails, then permits retry", async () => {
    const rawToken = await registerAndCaptureVerificationToken();
    const update = vi.spyOn(User, "findOneAndUpdate")
      .mockRejectedValueOnce(new Error("synthetic user write failure"));

    const failed = await verifyEmail(postRequest("/api/auth/verify-email", { token: rawToken }));
    expect(failed.status).toBe(500);
    update.mockRestore();

    expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeNull();
    expect(await EmailVerificationToken.countDocuments()).toBe(1);

    const retried = await verifyEmail(postRequest("/api/auth/verify-email", { token: rawToken }));
    expect(retried.status).toBe(200);
    expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
  });

  it("allows only one concurrent confirmation and consumes all account links on commit", async () => {
    const firstToken = await registerAndCaptureVerificationToken();
    let secondToken = "";
    const send = vi.spyOn(emailService, "send").mockImplementation(async ({ text }) => {
      secondToken = /token=([^\s]+)/u.exec(text)?.[1] ?? "";
    });
    const resent = await resendVerification(postRequest(
      "/api/auth/resend-verification",
      { email: TEST_USER.email },
    ));
    send.mockRestore();
    expect(resent.status).toBe(200);
    expect(secondToken).toBeTruthy();
    expect(await EmailVerificationToken.countDocuments()).toBe(2);

    const results = await Promise.all([
      verifyEmail(postRequest("/api/auth/verify-email", { token: firstToken })),
      verifyEmail(postRequest("/api/auth/verify-email", { token: secondToken })),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
  });

  it("rejects expired and already-consumed verification links", async () => {
    const rawToken = await registerAndCaptureVerificationToken();
    await EmailVerificationToken.updateOne(
      {},
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    );

    expect((await verifyEmail(postRequest("/api/auth/verify-email", { token: rawToken }))).status)
      .toBe(400);
    expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeNull();

    await EmailVerificationToken.updateOne(
      {},
      { $set: { expiresAt: new Date(Date.now() + 60_000) } },
    );
    expect((await verifyEmail(postRequest("/api/auth/verify-email", { token: rawToken }))).status)
      .toBe(200);
    expect((await verifyEmail(postRequest("/api/auth/verify-email", { token: rawToken }))).status)
      .toBe(400);
  });

  it("retains both tokens from concurrent resends until one confirms the account", async () => {
    await registerAndCaptureVerificationToken();
    const rawTokens: string[] = [];
    const send = vi.spyOn(emailService, "send").mockImplementation(async ({ text }) => {
      rawTokens.push(/token=([^\s]+)/u.exec(text)?.[1] ?? "");
    });

    const responses = await Promise.all([
      resendVerification(postRequest("/api/auth/resend-verification", { email: TEST_USER.email })),
      resendVerification(postRequest("/api/auth/resend-verification", { email: TEST_USER.email })),
    ]);
    send.mockRestore();

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(rawTokens).toHaveLength(2);
    expect(await EmailVerificationToken.countDocuments()).toBe(3);
    expect((await verifyEmail(postRequest("/api/auth/verify-email", { token: rawTokens[0] }))).status)
      .toBe(200);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
  });

  it("preserves an earlier link and generic response after a resend times out", async () => {
    const oldToken = await registerAndCaptureVerificationToken();
    const send = vi.spyOn(emailService, "send").mockRejectedValueOnce(
      new Error("synthetic timeout after possible provider acceptance"),
    );

    const response = await resendVerification(postRequest(
      "/api/auth/resend-verification",
      { email: TEST_USER.email },
    ));
    send.mockRestore();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "If the account is pending, a verification email will be sent" },
    });
    expect(await EmailVerificationToken.countDocuments()).toBe(2);
    expect((await verifyEmail(postRequest("/api/auth/verify-email", { token: oldToken }))).status)
      .toBe(200);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
  });

  it("does not consume a valid token if its user no longer exists", async () => {
    const rawToken = await registerAndCaptureVerificationToken();
    await User.deleteOne({ email: TEST_USER.email });

    const response = await verifyEmail(postRequest("/api/auth/verify-email", { token: rawToken }));

    expect(response.status).toBe(400);
    expect(await EmailVerificationToken.countDocuments()).toBe(1);
  });
});

describe("transactional password reset tokens", () => {
  beforeEach(createVerifiedUser);

  it("rolls token consumption and password/session changes back together", async () => {
    const rawToken = await createResetToken();
    const prior = await User.findOne({ email: TEST_USER.email }).lean();
    const update = vi.spyOn(User, "findByIdAndUpdate")
      .mockImplementationOnce(() => {
        throw new Error("synthetic user write failure");
      });

    const failed = await resetPassword(postRequest("/api/auth/reset-password", {
      token: rawToken,
      password: "new-password-123",
    }));
    expect(failed.status).toBe(500);
    update.mockRestore();

    const tokenRecord = await PasswordResetToken.findOne({}).lean();
    const unchanged = await User.findOne({ email: TEST_USER.email }).lean();
    expect(tokenRecord?.used).toBe(false);
    expect(unchanged?.passwordHash).toBe(prior?.passwordHash);
    expect(unchanged?.sessionVersion).toBe(prior?.sessionVersion ?? 0);
    expect((await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }))).status).toBe(200);

    const retry = await resetPassword(postRequest("/api/auth/reset-password", {
      token: rawToken,
      password: "new-password-123",
    }));
    expect(retry.status).toBe(200);
  });

  it("allows only one concurrent reset and invalidates other outstanding reset links", async () => {
    const oldSession = await loginToken();
    const tokens: string[] = [];
    const send = vi.spyOn(emailService, "send").mockImplementation(async ({ text }) => {
      tokens.push(/token=([0-9a-f]{64})/u.exec(text)?.[1] ?? "");
    });
    const requests = await Promise.all([
      forgotPassword(postRequest("/api/auth/forgot-password", { email: TEST_USER.email })),
      forgotPassword(postRequest("/api/auth/forgot-password", { email: TEST_USER.email })),
    ]);
    send.mockRestore();
    expect(requests.map((response) => response.status)).toEqual([200, 200]);
    expect(tokens).toHaveLength(2);
    expect(await PasswordResetToken.countDocuments({ used: false })).toBe(2);

    const results = await Promise.all(tokens.map((token, index) => resetPassword(
      postRequest("/api/auth/reset-password", {
        token,
        password: `new-password-${index}-123`,
      }),
    )));

    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    const user = await User.findOne({ email: TEST_USER.email }).lean();
    expect(user?.sessionVersion).toBe(1);
    expect((await me(authedRequest("/api/auth/me", oldSession))).status).toBe(401);
    expect(await PasswordResetToken.countDocuments({ used: false })).toBe(0);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
  });

  it("keeps an earlier reset link usable when a newer email request fails", async () => {
    const oldToken = await createResetToken();
    const send = vi.spyOn(emailService, "send").mockRejectedValueOnce(
      new Error("synthetic provider rejection"),
    );

    const failedRequest = await forgotPassword(postRequest("/api/auth/forgot-password", {
      email: TEST_USER.email,
    }));
    send.mockRestore();

    expect(failedRequest.status).toBe(500);
    expect(await PasswordResetToken.countDocuments({ used: false })).toBe(2);
    const reset = await resetPassword(postRequest("/api/auth/reset-password", {
      token: oldToken,
      password: "recovered-password-123",
    }));
    expect(reset.status).toBe(200);
    expect(await PasswordResetToken.countDocuments({ used: false })).toBe(0);
  });

  it("returns reset success when post-commit notification fails", async () => {
    const oldSession = await loginToken();
    const rawToken = await createResetToken();
    const send = vi.spyOn(emailService, "send").mockRejectedValueOnce(
      new Error("synthetic notification timeout"),
    );

    const response = await resetPassword(postRequest("/api/auth/reset-password", {
      token: rawToken,
      password: "notification-failed-password-123",
    }));
    send.mockRestore();

    expect(response.status).toBe(200);
    expect((await response.json()).data.message).toBe("Password has been reset");
    expect((await User.findOne({ email: TEST_USER.email }))?.sessionVersion).toBe(1);
    expect((await me(authedRequest("/api/auth/me", oldSession))).status).toBe(401);
    expect((await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: "notification-failed-password-123",
    }))).status).toBe(200);
  });
});
