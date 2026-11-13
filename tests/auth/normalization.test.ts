import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { PATCH as patchMe } from "@/app/api/auth/me/route";
import { User } from "@/db/models/user";
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

async function tokenFor(email = TEST_USER.email): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(email);
  await markTestUserVerified(TEST_USER.email);
  const response = await login(postRequest("/api/auth/login", {
    email,
    password: TEST_USER.password,
  }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

describe("auth normalization and boundaries", () => {
  it("stores emails lowercased and trims names", async () => {
    const response = await register(postRequest("/api/auth/register", {
      name: "  Spaced Name  ",
      email: "MIXED-Case@TEST.com",
      password: "password-123",
    }));
    expect(response.status).toBe(201);
    const stored = await User.findOne({}).lean();
    expect(stored?.email).toBe("mixed-case@test.com");
    // Name trimming is enforced by schema; model also trims.
    expect(stored?.name).toBe("Spaced Name");
  });

  it("logs in with differently-cased email", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const response = await login(postRequest("/api/auth/login", {
      email: "AUTH-USER@TEST.COM",
      password: TEST_USER.password,
    }));
    expect(response.status).toBe(200);
  });

  it("trims updated names and rejects overlong ones", async () => {
    const token = await tokenFor();
    const trimmed = await patchMe(
      authedRequest("/api/auth/me", token, {
        method: "PATCH",
        body: { name: "  Padded  " },
      }),
    );
    expect(trimmed.status).toBe(200);
    expect((await trimmed.json()).data.name).toBe("Padded");

    const overlong = await patchMe(
      authedRequest("/api/auth/me", token, {
        method: "PATCH",
        body: { name: "x".repeat(101) },
      }),
    );
    expect(overlong.status).toBe(400);
    expect((await overlong.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects too-short new passwords with VALIDATION_ERROR", async () => {
    const { POST: changePassword } = await import(
      "@/app/api/auth/change-password/route"
    );
    const token = await tokenFor();
    const response = await changePassword(
      authedRequest("/api/auth/change-password", token, {
        method: "POST",
        body: { currentPassword: TEST_USER.password, newPassword: "short" },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects too-short registration passwords", async () => {
    const response = await register(postRequest("/api/auth/register", {
      ...TEST_USER,
      email: "other@test.com",
      password: "short",
    }));
    expect(response.status).toBe(400);
  });
});
