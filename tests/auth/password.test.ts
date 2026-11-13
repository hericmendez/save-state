import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { emailService } from "@/server/auth/email";
import { PasswordResetToken } from "@/db/models/password-reset-token";
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

async function loginToken(password: string = TEST_USER.password): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(postRequest("/api/auth/login", {
    email: TEST_USER.email,
    password,
  }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

describe("POST /api/auth/change-password", () => {
  it("changes the password and invalidates the previous session", async () => {
    const oldToken = await loginToken();
    const response = await changePassword(
      authedRequest("/api/auth/change-password", oldToken, {
        method: "POST",
        body: { currentPassword: TEST_USER.password, newPassword: "new-password-123" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "Password changed successfully" },
    });
    expect(response.cookies.get("token")?.value).toBe("");

    // Old session is dead.
    expect((await me(authedRequest("/api/auth/me", oldToken))).status).toBe(401);

    // New password works and yields a live session.
    const token = await loginToken("new-password-123");
    expect((await me(authedRequest("/api/auth/me", token))).status).toBe(200);

    // Old password no longer works.
    const stale = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    expect(stale.status).toBe(401);
  });

  it("rejects a wrong current password with INVALID_PASSWORD", async () => {
    const token = await loginToken();
    const response = await changePassword(
      authedRequest("/api/auth/change-password", token, {
        method: "POST",
        body: { currentPassword: "wrong-12345", newPassword: "new-password-123" },
      }),
    );
    expect(response.status).toBe(400);
    expect(response.cookies.get("token")).toBeUndefined();
    expect(await response.json()).toEqual({
      error: { code: "INVALID_PASSWORD", message: "Current password is incorrect" },
    });
  });

  it("rejects a new password equal to the current one", async () => {
    const response = await changePassword(
      authedRequest("/api/auth/change-password", await loginToken(), {
        method: "POST",
        body: { currentPassword: TEST_USER.password, newPassword: TEST_USER.password },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    const response = await changePassword(
      postRequest("/api/auth/change-password", {
        currentPassword: "x",
        newPassword: "new-password-123",
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("creates a reset token and uses APP_URL without localhost", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const sent: Array<{ text: string }> = [];
    const spy = vi
      .spyOn(emailService, "send")
      .mockImplementation(async (options) => {
        sent.push({ text: options.text });
      });

    const response = await forgotPassword(
      postRequest("/api/auth/forgot-password", { email: TEST_USER.email }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "If an account exists, a reset email has been sent" },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("http://test.local/reset-password?token=");
    expect(sent[0].text).not.toContain("localhost:1337");

    const stored = await PasswordResetToken.find({});
    expect(stored).toHaveLength(1);
    expect(stored[0].used).toBe(false);
    spy.mockRestore();
  });

  it("responds identically for unknown emails and creates nothing", async () => {
    const response = await forgotPassword(
      postRequest("/api/auth/forgot-password", { email: "nobody@test.com" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "If an account exists, a reset email has been sent" },
    });
    expect(await PasswordResetToken.countDocuments()).toBe(0);
  });

  it("validates input with VALIDATION_ERROR", async () => {
    const response = await forgotPassword(
      postRequest("/api/auth/forgot-password", { email: "nope" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/auth/reset-password", () => {
  async function requestResetToken(): Promise<string> {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    let captured = "";
    const spy = vi
      .spyOn(emailService, "send")
      .mockImplementation(async (options) => {
        captured = /token=([0-9a-f]+)/.exec(options.text)?.[1] ?? "";
      });
    await forgotPassword(postRequest("/api/auth/forgot-password", {
      email: TEST_USER.email,
    }));
    spy.mockRestore();
    if (!captured) throw new Error("no reset token captured");
    return captured;
  }

  it("resets the password, consumes the token, and invalidates sessions", async () => {
    const oldToken = await loginToken();
    const rawToken = await requestResetToken();

    const response = await resetPassword(
      postRequest("/api/auth/reset-password", {
        token: rawToken,
        password: "brand-new-password-1",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "Password has been reset" },
    });

    // Token is single-use.
    const reuse = await resetPassword(
      postRequest("/api/auth/reset-password", {
        token: rawToken,
        password: "another-password-1",
      }),
    );
    expect(reuse.status).toBe(400);
    expect((await reuse.json()).error.code).toBe("INVALID_TOKEN");

    // Previous session is dead; new password works.
    expect((await me(authedRequest("/api/auth/me", oldToken))).status).toBe(401);
    const token = await loginToken("brand-new-password-1");
    expect((await me(authedRequest("/api/auth/me", token))).status).toBe(200);
  });

  it("rejects unknown tokens with INVALID_TOKEN", async () => {
    const response = await resetPassword(
      postRequest("/api/auth/reset-password", {
        token: "0".repeat(64),
        password: "brand-new-password-1",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_TOKEN", message: "Invalid or expired reset token" },
    });
  });

  it("rejects expired tokens", async () => {
    const rawToken = await requestResetToken();
    await PasswordResetToken.updateMany(
      {},
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const response = await resetPassword(
      postRequest("/api/auth/reset-password", {
        token: rawToken,
        password: "brand-new-password-1",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_TOKEN");
  });
});
