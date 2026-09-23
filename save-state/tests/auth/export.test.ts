/**
 * Fase 9B — export API coverage gap: the routes had real UI usage
 * (settings export buttons) but no dedicated tests.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as exportJson } from "@/app/api/auth/export/route";
import { GET as exportCsv } from "@/app/api/auth/export/csv/route";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  const response = await login(
    postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
  );
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

function authed(path: string, token: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `token=${token}` },
  });
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

describe("GET /api/auth/export", () => {
  it("requires authentication", async () => {
    const response = await exportJson(
      new NextRequest("http://localhost/api/auth/export"),
    );
    expect(response.status).toBe(401);
  });

  it("returns the caller payload as a JSON attachment", async () => {
    const token = await tokenFor();
    const response = await exportJson(authed("/api/auth/export", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain(
      "attachment",
    );
    const body = await response.json();
    expect(body.user.email).toBe(TEST_USER.email);
    expect(typeof body.exportedAt).toBe("string");
    expect(Array.isArray(body.games)).toBe(true);
    expect(Array.isArray(body.lists)).toBe(true);
  });
});

describe("GET /api/auth/export/csv", () => {
  it("requires authentication", async () => {
    const response = await exportCsv(
      new NextRequest("http://localhost/api/auth/export/csv"),
    );
    expect(response.status).toBe(401);
  });

  it("returns CSV with the expected content type", async () => {
    const token = await tokenFor();
    const response = await exportCsv(authed("/api/auth/export/csv", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    const text = await response.text();
    expect(text.split("\n")[0]).toContain("userId");
  });
});
