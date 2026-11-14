/**
 * Fase 6 — ATP ownership marking (display state, Save State side).
 *
 * Search cards and previews carry `owned`: true when the ATP game already
 * produced a UserGame for the caller. Resolved in batched queries (no N+1),
 * never from ATP data, and scoped per user.
 */

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as search } from "@/app/api/atp/search/route";
import { GET as detail } from "@/app/api/atp/games/[id]/route";
import { POST as importGame } from "@/app/api/atp/import/route";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { ATP_GAME_FIXTURE } from "./client.test";

const ATP_ID = "atp-wikipedia-6509467";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubCatalog(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/games/search") {
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }
      if (url.pathname === `/api/v1/games/${ATP_ID}`) {
        return jsonResponse({ data: ATP_GAME_FIXTURE, origin: "database" });
      }
      if (url.pathname === `/api/v1/games/${ATP_ID}/cover`) {
        return jsonResponse({
          data: { gameId: ATP_ID, selected: null, candidates: [] },
          origin: "database",
        });
      }
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    }),
  );
}

async function tokenFor(): Promise<string> {
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

function authed(path: string, token: string, init?: { method?: string; body?: unknown }): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      cookie: `token=${token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeAll(async () => {
  await startTestDatabase();
  process.env.ATP_BASE_URL = "http://atp.test";
});
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  process.env.ATP_BASE_URL = "http://atp.test";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ATP ownership marking", () => {
  it("marks search cards unowned before import", async () => {
    stubCatalog();
    const token = await tokenFor();
    const response = await search(authed("/api/atp/search?q=chrono", token));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ atpId: ATP_ID, owned: false });
    expect(body.data[0]).not.toHaveProperty("favorite");
    expect(body.data[0]).not.toHaveProperty("status");
  });

  it("marks search cards owned after import", async () => {
    stubCatalog();
    const token = await tokenFor();
    await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID },
      }),
    );
    const response = await search(authed("/api/atp/search?q=chrono", token));
    expect((await response.json()).data[0]).toMatchObject({
      atpId: ATP_ID,
      owned: true,
    });
  });

  it("marks previews owned only for the owning user", async () => {
    stubCatalog();
    const token = await tokenFor();
    const params = { params: Promise.resolve({ id: ATP_ID }) };
    const before = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    expect((await before.json()).data.owned).toBe(false);

    await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID },
      }),
    );
    const after = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    const body = await after.json();
    expect(body.data.owned).toBe(true);
    expect(body.data).not.toHaveProperty("favorite");
    expect(body.data).not.toHaveProperty("hoursPlayed");
  });

  it("scopes ownership per user", async () => {
    stubCatalog();
    const token = await tokenFor();
    await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID },
      }),
    );

    await register(
      postRequest("/api/auth/register", {
        name: "Other",
        email: "other@test.com",
        password: "password-123",
      }),
    );
    await markTestUserVerified("other@test.com");
    const otherLogin = await login(
      postRequest("/api/auth/login", {
        email: "other@test.com",
        password: "password-123",
      }),
    );
    const otherToken = otherLogin.cookies.get("token")?.value;
    if (!otherToken) throw new Error("second login did not issue a token");

    const response = await search(authed("/api/atp/search?q=chrono", otherToken));
    expect((await response.json()).data[0]).toMatchObject({ owned: false });
  });
});
