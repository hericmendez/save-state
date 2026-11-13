import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me, PATCH as patchMe } from "@/app/api/auth/me/route";
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

const JWT_SECRET = "test-secret-test-secret-test-secret-1234";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function loginToken(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(postRequest("/api/auth/login", {
    email: TEST_USER.email,
    password: TEST_USER.password,
  }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

describe("GET /api/auth/me", () => {
  it("returns the SafeUser for an authenticated session", async () => {
    const response = await me(authedRequest("/api/auth/me", await loginToken()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      name: TEST_USER.name,
      email: TEST_USER.email,
    });
    expect(typeof body.data.id).toBe("string");
    expect(body.data).not.toHaveProperty("passwordHash");
    expect(body.data).not.toHaveProperty("sessionVersion");
  });

  it("rejects requests without a cookie", async () => {
    const response = await me(new NextRequest("http://localhost/api/auth/me"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Authentication is required" },
    });
  });

  it("rejects malformed tokens", async () => {
    const response = await me(authedRequest("/api/auth/me", "not-a-jwt"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects expired tokens", async () => {
    const token = jwt.sign({ userId: "x".repeat(24), sessionVersion: 0 }, JWT_SECRET, {
      expiresIn: "-10s",
    });
    const response = await me(authedRequest("/api/auth/me", token));
    expect(response.status).toBe(401);
  });

  it("rejects tokens with a wrong shape", async () => {
    for (const payload of [
      { sessionVersion: 0 },
      { userId: "x".repeat(24) },
      { userId: "x".repeat(24), sessionVersion: -1 },
      { userId: "x".repeat(24), sessionVersion: 1.5 },
      { userId: "x".repeat(24), sessionVersion: "0" },
    ]) {
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
      const response = await me(authedRequest("/api/auth/me", token));
      expect(response.status).toBe(401);
    }
  });

  it("rejects tokens signed with another secret", async () => {
    const token = jwt.sign(
      { userId: "x".repeat(24), sessionVersion: 0 },
      "different-secret-different-secret-1",
      { expiresIn: "7d" },
    );
    const response = await me(authedRequest("/api/auth/me", token));
    expect(response.status).toBe(401);
  });

  it("rejects the session when the user no longer exists", async () => {
    const token = await loginToken();
    await clearDatabase();
    // Session validation runs before the user lookup (same ordering as the
    // legacy middleware), so a deleted user surfaces as UNAUTHENTICATED.
    // The handler's USER_NOT_FOUND branch remains for lookup races.
    const response = await me(authedRequest("/api/auth/me", token));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a valid JWT after the user's email is no longer verified", async () => {
    const token = await loginToken();
    await User.updateOne(
      { email: TEST_USER.email },
      { $set: { emailVerifiedAt: null } },
    );
    const response = await me(authedRequest("/api/auth/me", token));
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/auth/me", () => {
  it("updates the name and returns the SafeUser", async () => {
    const response = await patchMe(
      authedRequest("/api/auth/me", await loginToken(), {
        method: "PATCH",
        body: { name: "Renamed User" },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Renamed User");
    expect(body.data.email).toBe(TEST_USER.email);
  });

  it("requires authentication", async () => {
    const response = await patchMe(
      new NextRequest("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects unexpected fields and invalid names", async () => {
    const token = await loginToken();
    const extraField = await patchMe(
      authedRequest("/api/auth/me", token, {
        method: "PATCH",
        body: { name: "Fine", email: "hack@test.com" },
      }),
    );
    expect(extraField.status).toBe(400);
    expect((await extraField.json()).error.code).toBe("VALIDATION_ERROR");

    const emptyName = await patchMe(
      authedRequest("/api/auth/me", token, {
        method: "PATCH",
        body: { name: "  " },
      }),
    );
    expect(emptyName.status).toBe(400);
  });
});
