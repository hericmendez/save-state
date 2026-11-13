import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  markTestUserVerified,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as resendVerification } from "@/app/api/auth/resend-verification/route";
import { emailService } from "@/server/auth/email";
import { User } from "@/db/models/user";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import bcrypt from "bcryptjs";
import { logger } from "@/server/shared/logger";
import { deliverVerificationEmail } from "@/server/auth/verification-email";
import { __resetServerEnvCache } from "@/lib/env";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

function setCookieHeader(response: Response): string | null {
  return response.headers.get("set-cookie");
}

describe("POST /api/auth/register", () => {
  it("registers with valid input and returns only the generic response", async () => {
    const response = await register(postRequest("/api/auth/register", TEST_USER));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      data: {
        message:
          "Se o endereço puder receber uma confirmação, enviaremos instruções. Verifique sua caixa de entrada ou solicite outro link.",
      },
    });
    const stored = await User.findOne({ email: TEST_USER.email });
    expect(stored?.emailVerifiedAt).toBeNull();
    expect(setCookieHeader(response)).toBeNull();
  });

  it("does not set a session cookie on registration", async () => {
    const response = await register(postRequest("/api/auth/register", TEST_USER));
    expect(response.status).toBe(201);
    expect(setCookieHeader(response)).toBeNull();
  });

  it.each([
    ["missing email configuration", "Transactional email is not configured"],
    ["provider rejection", "Email provider rejected request (503)"],
    ["indeterminate network timeout", "The email request timed out"],
  ])("keeps the public signup response generic after %s", async (_scenario, failure) => {
    let rawToken = "";
    const errorLog = vi.spyOn(logger, "error");
    const send = vi.spyOn(emailService, "send").mockImplementation(async ({ text }) => {
      rawToken = /token=([^\s]+)/u.exec(text)?.[1] ?? "";
      throw new Error(failure);
    });

    try {
      const response = await register(postRequest("/api/auth/register", TEST_USER));
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toEqual({
        data: {
          message:
            "Se o endereço puder receber uma confirmação, enviaremos instruções. Verifique sua caixa de entrada ou solicite outro link.",
        },
      });
      expect(JSON.stringify(body)).not.toContain(rawToken);

      const account = await User.findOne({ email: TEST_USER.email });
      expect(account?.emailVerifiedAt).toBeNull();
      expect(await EmailVerificationToken.countDocuments({ userId: account?._id })).toBe(1);
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/u);
      expect((await EmailVerificationToken.findOne({ userId: account?._id }))?.tokenHash)
        .not.toBe(rawToken);
      expect(errorLog).toHaveBeenCalledWith("Verification email delivery failed", { name: "Error" });
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(TEST_USER.email);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(rawToken);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(TEST_USER.password);

      const loginResponse = await login(postRequest("/api/auth/login", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      }));
      expect(loginResponse.status).toBe(401);
      expect(setCookieHeader(loginResponse)).toBeNull();
    } finally {
      send.mockRestore();
      errorLog.mockRestore();
    }
  });

  it("does not convert unrelated database failures into a generic signup success", async () => {
    const find = vi.spyOn(User, "findOne").mockRejectedValue(new Error("synthetic database outage"));
    try {
      const response = await register(postRequest("/api/auth/register", TEST_USER));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      });
    } finally {
      find.mockRestore();
    }
  });

  it("does not treat another unique-index conflict as an existing email", async () => {
    const duplicateOtherIndex = Object.assign(new Error("duplicate username"), {
      code: 11000,
      keyPattern: { username: 1 },
      keyValue: { username: "test" },
    });
    const create = vi.spyOn(User, "create").mockRejectedValue(duplicateOtherIndex);
    try {
      const response = await register(postRequest("/api/auth/register", TEST_USER));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      });
    } finally {
      create.mockRestore();
    }
  });

  it("observes missing Resend configuration without logging recipient or token", async () => {
    const keys = ["NODE_ENV", "MONGODB_URI", "JWT_SECRET", "APP_URL", "RESEND_API_KEY", "EMAIL_FROM"];
    const original = new Map(keys.map((key) => [key, process.env[key]]));
    const send = vi.spyOn(emailService, "send");
    const errorLog = vi.spyOn(logger, "error");
    Object.assign(process.env, {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://127.0.0.1:27017/auth-a11-test",
      JWT_SECRET: "test-secret-test-secret-test-secret-1234",
      APP_URL: "https://save-state.example",
    });
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    __resetServerEnvCache();

    try {
      await deliverVerificationEmail({ to: TEST_USER.email, rawToken: "verification-token-secret" });
      expect(send).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith("Verification email delivery failed", { name: "Error" });
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(TEST_USER.email);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain("verification-token-secret");
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(TEST_USER.password);
    } finally {
      send.mockRestore();
      errorLog.mockRestore();
      for (const [key, value] of original) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      __resetServerEnvCache();
    }
  });

  it("recovers a failed deferred delivery through the existing generic resend endpoint", async () => {
    const issuedTokens: string[] = [];
    const send = vi.spyOn(emailService, "send").mockImplementationOnce(async ({ text }) => {
      issuedTokens.push(/token=([^\s]+)/u.exec(text)?.[1] ?? "");
      throw new Error("Synthetic provider timeout after request");
    }).mockImplementationOnce(async ({ text }) => {
      issuedTokens.push(/token=([^\s]+)/u.exec(text)?.[1] ?? "");
    });

    try {
      const registration = await register(postRequest("/api/auth/register", TEST_USER));
      expect(registration.status).toBe(201);
      const account = await User.findOne({ email: TEST_USER.email });
      const originalToken = await EmailVerificationToken.findOne({ userId: account?._id }).lean();
      expect(originalToken).toBeTruthy();

      const response = await resendVerification(postRequest(
        "/api/auth/resend-verification",
        { email: TEST_USER.email },
      ));

      expect(response.status).toBe(200);
      const responseBody = await response.json();
      expect(responseBody).toEqual({
        data: { message: "If the account is pending, a verification email will be sent" },
      });
      expect(issuedTokens).toHaveLength(2);
      expect(issuedTokens[0]).not.toBe(issuedTokens[1]);
      expect(JSON.stringify(responseBody)).not.toContain(issuedTokens[1]);
      const issuedRecords = await EmailVerificationToken.find({ userId: account?._id }).lean();
      // Reissue does not invalidate an older link before delivery is known;
      // either valid link can verify, and success retires every account link.
      expect(issuedRecords).toHaveLength(2);
      expect(issuedRecords.some((record) => record.tokenHash === originalToken?.tokenHash)).toBe(true);
      expect(issuedRecords.some((record) => record.tokenHash !== originalToken?.tokenHash)).toBe(true);
      expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeNull();
    } finally {
      send.mockRestore();
    }
  });

  it("returns the same public response for new, pending, and verified addresses", async () => {
    const fresh = await register(postRequest("/api/auth/register", TEST_USER));
    const freshBody = await fresh.json();
    const pending = await register(postRequest("/api/auth/register", {
      ...TEST_USER,
      name: "Changed Name",
      password: "different-password-456",
    }));
    const pendingBody = await pending.json();
    const userBeforeVerify = await User.findOne({ email: TEST_USER.email }).lean();
    const tokenCountBeforeVerify = await EmailVerificationToken.countDocuments({
      userId: userBeforeVerify?._id,
    });
    await User.updateOne(
      { email: TEST_USER.email },
      { $set: { emailVerifiedAt: new Date() }, $inc: { sessionVersion: 3 } },
    );
    const verified = await register(postRequest("/api/auth/register", {
      ...TEST_USER,
      email: "AUTH-USER@TEST.COM",
      name: "Another Name",
      password: "yet-another-password-789",
    }));
    const verifiedBody = await verified.json();

    expect([fresh.status, pending.status, verified.status]).toEqual([201, 201, 201]);
    expect(pendingBody).toEqual(freshBody);
    expect(verifiedBody).toEqual(freshBody);
    expect(JSON.stringify(freshBody)).not.toMatch(/EMAIL_ALREADY_IN_USE|email|user|token|verified/i);
    const unchanged = await User.findOne({ email: TEST_USER.email }).lean();
    expect(await bcrypt.compare(TEST_USER.password, unchanged!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("different-password-456", unchanged!.passwordHash)).toBe(false);
    expect(unchanged?.emailVerifiedAt).toEqual(expect.any(Date));
    expect(unchanged?.sessionVersion).toBe(3);
    expect(await User.countDocuments({ email: TEST_USER.email })).toBe(1);
    expect(await EmailVerificationToken.countDocuments({ userId: unchanged?._id })).toBe(tokenCountBeforeVerify);
  });

  it("validates input with VALIDATION_ERROR", async () => {
    const response = await register(postRequest("/api/auth/register", {
      name: "",
      email: "not-an-email",
      password: "short",
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in and sets an httpOnly session cookie", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const response = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.email).toBe(TEST_USER.email);
    expect(body.data).not.toHaveProperty("passwordHash");

    const cookie = setCookieHeader(response) ?? "";
    const lower = cookie.toLowerCase();
    expect(cookie).toContain("token=");
    expect(lower).toContain("httponly");
    expect(lower).toContain("samesite=lax");
    expect(lower).toContain("path=/");
    expect(lower).toContain("max-age=604800");
  });

  it("rejects wrong passwords without distinguishing the cause", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const wrongPassword = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: "wrong-password-123",
    }));
    const unknownUser = await login(postRequest("/api/auth/login", {
      email: "nobody@test.com",
      password: "password-123",
    }));
    for (const response of [wrongPassword, unknownUser]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHENTICATED", message: "Invalid credentials" },
      });
    }
  });

  it("rejects valid credentials until the email is verified and emits no session", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    const response = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toBeNull();
    expect(response.cookies.get("token")).toBeUndefined();
  });

  it("verifies the email through the real token endpoint and then permits login", async () => {
    let verificationToken = "";
    const send = vi.spyOn(emailService, "send").mockImplementation(async ({ text }) => {
      verificationToken = /token=([^\s]+)/.exec(text)?.[1] ?? "";
    });
    try {
      const registration = await register(postRequest("/api/auth/register", TEST_USER));
      expect(registration.status).toBe(201);
      expect(verificationToken).toMatch(/^[0-9a-f]{64}$/);

      const verified = await verifyEmail(postRequest("/api/auth/verify-email", {
        token: verificationToken,
      }));
      expect(verified.status).toBe(200);
      expect((await User.findOne({ email: TEST_USER.email }))?.emailVerifiedAt).toBeInstanceOf(Date);

      const response = await login(postRequest("/api/auth/login", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      }));
      expect(response.status).toBe(200);
      expect(response.cookies.get("token")?.value).toBeTruthy();
    } finally {
      send.mockRestore();
    }
  });

  it("validates input with VALIDATION_ERROR", async () => {
    const response = await login(postRequest("/api/auth/login", {
      email: "not-an-email",
      password: "",
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("issued session grants access to /me", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const token = loginResponse.cookies.get("token")?.value;
    expect(token).toBeTruthy();
    const meResponse = await me(authedRequest("/api/auth/me", token!));
    expect(meResponse.status).toBe(200);
  });
});
