import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import {
  __resetRateLimitBuckets,
  AUTH_RATE_LIMIT,
  checkRateLimit,
} from "@/server/auth/rate-limit";
import {
  TEST_USER,
  clearDatabase,
  markTestUserVerified,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";
import { POST as register } from "@/app/api/auth/register/route";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);
afterEach(() => {
  vi.unstubAllEnvs();
  __resetRateLimitBuckets();
});

function loginRequest(ip: string) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
  });
}

describe("authentication rate limiting", () => {
  it("is bypassed in test environments", async () => {
    await register(postRequest("/api/auth/register", TEST_USER));
    await markTestUserVerified(TEST_USER.email);
    for (let attempt = 0; attempt < AUTH_RATE_LIMIT.max + 5; attempt += 1) {
      const response = await login(loginRequest("10.0.0.1"));
      expect(response.status).toBe(200);
    }
  });

  it("enforces per-route buckets outside test environments", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = () =>
      new NextRequest("http://localhost/api/auth/login", {
        headers: { "x-forwarded-for": "10.0.0.2" },
      });

    for (let attempt = 0; attempt < AUTH_RATE_LIMIT.max; attempt += 1) {
      expect(() =>
        checkRateLimit(request(), "POST /api/auth/login", AUTH_RATE_LIMIT),
      ).not.toThrow();
    }
    expect(() =>
      checkRateLimit(request(), "POST /api/auth/login", AUTH_RATE_LIMIT),
    ).toThrowError(expect.objectContaining({ code: "RATE_LIMIT_EXCEEDED" }));

    try {
      checkRateLimit(request(), "POST /api/auth/login", AUTH_RATE_LIMIT);
      expect.unreachable();
    } catch (error) {
      const apiError = error as { code: string; status: number };
      expect(apiError.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(apiError.status).toBe(429);
    }
  });

  it("isolates buckets per client and route", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const tinyWindow = { windowMs: 15 * 60 * 1000, max: 1 };
    const request = (ip: string) =>
      new NextRequest("http://localhost/api/auth/login", {
        headers: { "x-forwarded-for": ip },
      });

    checkRateLimit(request("10.0.0.3"), "POST /api/auth/login", tinyWindow);
    // Same client, other route: unaffected.
    expect(() =>
      checkRateLimit(request("10.0.0.3"), "POST /api/auth/register", tinyWindow),
    ).not.toThrow();
    // Other client, same route: unaffected.
    expect(() =>
      checkRateLimit(request("10.0.0.4"), "POST /api/auth/login", tinyWindow),
    ).not.toThrow();
    // Same client and route: exhausted.
    expect(() =>
      checkRateLimit(request("10.0.0.3"), "POST /api/auth/login", tinyWindow),
    ).toThrowError(expect.objectContaining({ code: "RATE_LIMIT_EXCEEDED" }));
  });
});
