/**
 * Login failure-mode regression tests (isolated mongodb-memory-server).
 *
 * Covers what the happy-path suite cannot: a real database outage must
 * surface as a sanitized 500 (never a leak, never a masked 401), invalid
 * auth configuration must fail closed the same way, unhandled handler
 * errors must be logged redacted in development, and a user created
 * through the seed's service path (registerUser) must authenticate
 * through the HTTP login handler.
 */

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { __resetConnectionCache, connectDatabase } from "@/db/connection";
import { __resetServerEnvCache } from "@/lib/env";
import { registerUser } from "@/server/auth/service";
import { handleRoute } from "@/server/shared/route-handler";
import {
  TEST_USER,
  clearDatabase,
  markTestUserVerified,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";

const SEED_STYLE_USER = {
  name: "Test Player",
  email: "seed-user@test.local",
  password: "seed-password-01",
} as const;

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function reconnect(): Promise<void> {
  __resetConnectionCache();
  __resetServerEnvCache();
  await connectDatabase();
}

describe("seed-created user compatibility", () => {
  it("authenticates a registerUser-created account via POST /api/auth/login", async () => {
    // Same service path the Atlas seed uses: no HTTP registration involved.
    await registerUser({ ...SEED_STYLE_USER });
    await markTestUserVerified(SEED_STYLE_USER.email);
    const response = await login(
      postRequest("/api/auth/login", {
        email: SEED_STYLE_USER.email,
        password: SEED_STYLE_USER.password,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.email).toBe(SEED_STYLE_USER.email);
    expect(body.data).not.toHaveProperty("passwordHash");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("token=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });
});

describe("login infrastructure failures", () => {
  it("maps a database outage to sanitized 500 INTERNAL_ERROR", async () => {
    await registerUser({ ...TEST_USER });
    await markTestUserVerified(TEST_USER.email);
    __resetConnectionCache();
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockRejectedValueOnce(
        new Error("querySrv ECONNREFUSED _mongodb._tcp.cluster0.example.mongodb.net"),
      );
    try {
      const response = await login(
        postRequest("/api/auth/login", {
          email: TEST_USER.email,
          password: TEST_USER.password,
        }),
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      });
    } finally {
      connect.mockRestore();
      await reconnect();
    }
  });

  it("does not mask an outage as 401", async () => {
    await registerUser({ ...TEST_USER });
    await markTestUserVerified(TEST_USER.email);
    __resetConnectionCache();
    const connect = vi.spyOn(mongoose, "connect").mockRejectedValueOnce(new Error("boom"));
    try {
      const response = await login(
        postRequest("/api/auth/login", {
          email: "nobody@test.com",
          password: "password-123",
        }),
      );
      expect(response.status).toBe(500);
    } finally {
      connect.mockRestore();
      await reconnect();
    }
  });

  it("fails closed with sanitized 500 on invalid auth configuration", async () => {
    await registerUser({ ...TEST_USER });
    await markTestUserVerified(TEST_USER.email);
    const savedSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    __resetServerEnvCache();
    try {
      const response = await login(
        postRequest("/api/auth/login", {
          email: TEST_USER.email,
          password: TEST_USER.password,
        }),
      );
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(body)).not.toContain("JWT_SECRET");
    } finally {
      process.env.JWT_SECRET = savedSecret;
      await reconnect();
    }
  });
});

describe("unhandled handler errors", () => {
  it("logs message and stack redacted while keeping the client response sanitized", async () => {
    const logged: unknown[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    try {
      const response = await handleRoute(() => {
        throw new Error("connect failed for mongodb://user:s3cret@host/db and Bearer abc123");
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      });
      const output = logged.join("\n");
      expect(output).toContain("Unhandled route handler error");
      expect(output).toContain("connect failed");
      expect(output).not.toContain("s3cret");
      expect(output).not.toContain("abc123");
      expect(output).toContain("mongodb://***@host/db");
      expect(output).toContain("Bearer ***");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
