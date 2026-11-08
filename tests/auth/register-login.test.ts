import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";
import { GET as me } from "@/app/api/auth/me/route";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

function setCookieHeader(response: Response): string | null {
  return response.headers.get("set-cookie");
}

describe("POST /api/auth/register", () => {
  it("registers with valid input and returns the SafeUser", async () => {
    const response = await register(postRequest("/api/auth/register", TEST_USER));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.name).toBe(TEST_USER.name);
    expect(body.data.email).toBe(TEST_USER.email);
    expect(typeof body.data.id).toBe("string");
    expect(body.data).not.toHaveProperty("passwordHash");
    expect(body.data).not.toHaveProperty("sessionVersion");
    expect(body.data).not.toHaveProperty("_id");
  });

  it("does not set a session cookie on registration", async () => {
    const response = await register(postRequest("/api/auth/register", TEST_USER));
    expect(response.status).toBe(201);
    expect(setCookieHeader(response)).toBeNull();
  });

  it("rejects duplicate emails with EMAIL_ALREADY_IN_USE", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    const response = await register(postRequest("/api/auth/register", {
      ...TEST_USER,
      name: "Other Name",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "EMAIL_ALREADY_IN_USE", message: "Email is already in use" },
    });
  });

  it("treats emails case-insensitively for duplicates", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    const response = await register(postRequest("/api/auth/register", {
      ...TEST_USER,
      email: "AUTH-USER@TEST.COM",
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("EMAIL_ALREADY_IN_USE");
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
