import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as logout } from "@/app/api/logout/route";
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

describe("POST /api/logout", () => {
  it("clears the cookie and returns the logout message", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const token = loginResponse.cookies.get("token")?.value;
    expect(token).toBeTruthy();

    const response = await logout(authedRequest("/api/logout", token ?? "", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { message: "Logged out" },
    });
    const cleared = response.cookies.get("token")?.value ?? "";
    expect(cleared).toBe("");
  });

  it("increments sessionVersion and rejects the token used to log out", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const token = loginResponse.cookies.get("token")?.value ?? "";

    const before = await User.findOne({ email: TEST_USER.email }).lean();
    const response = await logout(authedRequest("/api/logout", token, { method: "POST" }));
    const after = await User.findOne({ email: TEST_USER.email }).lean();
    expect(response.status).toBe(200);
    expect(after?.sessionVersion).toBe((before?.sessionVersion ?? 0) + 1);

    expect((await me(authedRequest("/api/auth/me", token))).status).toBe(401);
  });

  it("works without an existing session", async () => {
    const response = await logout(new NextRequest("http://localhost/api/logout", { method: "POST" }));
    expect(response.status).toBe(200);
  });

  it("revokes all devices when one device logs out", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const firstToken = loginResponse.cookies.get("token")?.value ?? "";
    const secondLogin = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const secondToken = secondLogin.cookies.get("token")?.value ?? "";

    expect((await me(authedRequest("/api/auth/me", secondToken))).status).toBe(200);
    await logout(authedRequest("/api/logout", firstToken, { method: "POST" }));
    expect((await me(authedRequest("/api/auth/me", secondToken))).status).toBe(401);
  });

  it("cannot revoke a different user's sessions", async () => {
    const otherUser = {
      name: "Other User",
      email: "other-logout@test.com",
      password: "password-123",
    };
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    await register(postRequest("/api/auth/register", otherUser));
    await markTestUserVerified(otherUser.email);
    const [firstLogin, otherLogin] = await Promise.all([
      login(postRequest("/api/auth/login", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      })),
      login(postRequest("/api/auth/login", {
        email: otherUser.email,
        password: otherUser.password,
      })),
    ]);
    const firstToken = firstLogin.cookies.get("token")?.value ?? "";
    const otherToken = otherLogin.cookies.get("token")?.value ?? "";
    const otherBefore = await User.findOne({ email: otherUser.email }).lean();

    await logout(authedRequest("/api/logout", firstToken, { method: "POST" }));

    const otherAfter = await User.findOne({ email: otherUser.email }).lean();
    expect(otherAfter?.sessionVersion).toBe(otherBefore?.sessionVersion ?? 0);
    expect((await me(authedRequest("/api/auth/me", otherToken))).status).toBe(200);
  });

  it("keeps concurrent revocations atomic", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const token = loginResponse.cookies.get("token")?.value ?? "";
    const before = await User.findOne({ email: TEST_USER.email }).lean();

    const request = () => authedRequest("/api/logout", token, { method: "POST" });
    const responses = await Promise.all([logout(request()), logout(request())]);
    const after = await User.findOne({ email: TEST_USER.email }).lean();

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(after?.sessionVersion).toBe((before?.sessionVersion ?? 0) + 2);
    expect((await me(authedRequest("/api/auth/me", token))).status).toBe(401);
  });

  it("clears the local cookie but does not report success if revocation storage fails", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    const loginResponse = await login(postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }));
    const token = loginResponse.cookies.get("token")?.value ?? "";
    vi.spyOn(User, "updateOne").mockRejectedValueOnce(new Error("simulated write failure"));

    const response = await logout(authedRequest("/api/logout", token, { method: "POST" }));

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    expect(response.cookies.get("token")?.value).toBe("");
    expect((await me(authedRequest("/api/auth/me", token))).status).toBe(200);
  });
});
