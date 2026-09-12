import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as logout } from "@/app/api/logout/route";
import { User } from "@/db/models/user";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

describe("POST /api/logout", () => {
  it("clears the cookie and returns the logout message", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const token = loginResponse.cookies.get("token")?.value;
    expect(token).toBeTruthy();

    const response = await logout();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "Logged out" },
    });
    const cleared = response.cookies.get("token")?.value ?? "";
    expect(cleared).toBe("");
  });

  it("does NOT increment sessionVersion (ADR-019): the old token stays valid", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const token = loginResponse.cookies.get("token")?.value ?? "";

    const before = await User.findOne({ email: TEST_USER.email }).lean();
    await logout();
    const after = await User.findOne({ email: TEST_USER.email }).lean();
    expect(after?.sessionVersion).toBe(before?.sessionVersion ?? 0);

    expect((await me(authedRequest("/api/auth/me", token))).status).toBe(200);
  });

  it("works without an existing session", async () => {
    const response = await logout();
    expect(response.status).toBe(200);
  });
});
