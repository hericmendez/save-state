/**
 * Fase 7 — ATP taxonomy BFF: family search mapping, platform detail, and
 * server-side family derivation (grouped, no persistence, no N+1).
 */

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as search } from "@/app/api/atp/search/route";
import { GET as platformDetail } from "@/app/api/atp/platforms/[id]/route";
import { GET as families } from "@/app/api/atp/families/route";
import { groupPlatformsByFamily } from "@/server/atp/families";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { ATP_GAME_FIXTURE } from "./client.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function platformPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "nintendo-switch",
    name: "Nintendo Switch",
    company: "Nintendo",
    releaseYear: 2017,
    status: "active",
    family: "Nintendo",
    type: "hybrid",
    thumb: null,
    gameCount: 120,
    ...overrides,
  };
}

const seenUrls: string[] = [];

/** Route stubbed-ATP fetch calls by path, recording full URLs. */
function stubAtp(handler: (url: URL) => Response): void {
  seenUrls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("http://atp.test");
      seenUrls.push(url.toString());
      return handler(url);
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

function authed(path: string, token: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `token=${token}` },
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

describe("GET /api/atp/search?family", () => {
  it("maps family onto ATP platformFamily on the deterministic listing", async () => {
    stubAtp((url) => {
      if (url.pathname === "/api/v1/games") {
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await search(authed("/api/atp/search?family=Nintendo", token));
    expect(response.status).toBe(200);
    const called = new URL(seenUrls[0]);
    expect(called.pathname).toBe("/api/v1/games");
    expect(called.searchParams.get("platformFamily")).toBe("Nintendo");
    expect((await response.json()).data).toHaveLength(1);
  });

  it("combines family with text and other filters", async () => {
    stubAtp((url) =>
      url.pathname === "/api/v1/games"
        ? jsonResponse({
            data: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
          })
        : jsonResponse({ error: { code: "NOT_FOUND" } }, 404),
    );
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=mario&family=Nintendo&page=2", token),
    );
    expect(response.status).toBe(200);
    const called = new URL(seenUrls[0]);
    expect(called.searchParams.get("platformFamily")).toBe("Nintendo");
    expect(called.searchParams.get("search")).toBe("mario");
    expect(called.searchParams.get("page")).toBe("2");
  });
});

describe("GET /api/atp/platforms/:id", () => {
  const params = { params: Promise.resolve({ id: "nintendo-switch" }) };

  it("returns the platform detail", async () => {
    stubAtp((url) =>
      url.pathname === "/api/v1/platforms/nintendo-switch"
        ? jsonResponse({ data: platformPayload(), origin: "database" })
        : jsonResponse({ error: { code: "NOT_FOUND" } }, 404),
    );
    const token = await tokenFor();
    const response = await platformDetail(
      authed("/api/atp/platforms/nintendo-switch", token),
      params,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      id: "nintendo-switch",
      name: "Nintendo Switch",
      family: "Nintendo",
      gameCount: 120,
    });
  });

  it("requires authentication", async () => {
    const response = await platformDetail(
      new NextRequest("http://localhost/api/atp/platforms/x"),
      params,
    );
    expect(response.status).toBe(401);
  });

  it("maps unknown platforms to ATP_GAME_NOT_FOUND", async () => {
    stubAtp(() => jsonResponse({ error: { code: "NOT_FOUND" } }, 404));
    const token = await tokenFor();
    const response = await platformDetail(
      authed("/api/atp/platforms/atp-nope-1", token),
      { params: Promise.resolve({ id: "atp-nope-1" }) },
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ATP_GAME_NOT_FOUND");
  });
});

describe("GET /api/atp/families", () => {
  it("groups platforms server-side across pages", async () => {
    stubAtp((url) => {
      if (url.pathname !== "/api/v1/platforms/summary") {
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      }
      const page = url.searchParams.get("page") ?? "1";
      if (page === "1") {
        return jsonResponse({
          data: [
            platformPayload(),
            platformPayload({
              id: "pc-windows",
              name: "PC (Windows)",
              company: "Various",
              releaseYear: null,
              status: "active",
              family: "PC",
              gameCount: 500,
            }),
          ],
          pagination: { page: 1, limit: 100, total: 3, totalPages: 2 },
        });
      }
      return jsonResponse({
        data: [
          platformPayload({
            id: "android",
            name: "Android",
            company: "Google",
            family: "Mobile",
            gameCount: 300,
          }),
        ],
        pagination: { page: 2, limit: 100, total: 3, totalPages: 2 },
      });
    });
    const token = await tokenFor();
    const response = await families(authed("/api/atp/families", token));
    expect(response.status).toBe(200);
    const body = await response.json();
    // PC and Mobile arrive as plain family values — no special-casing.
    expect(body.data.map((f: { name: string }) => f.name)).toEqual([
      "Mobile",
      "Nintendo",
      "PC",
    ]);
    const nintendo = body.data.find(
      (f: { name: string }) => f.name === "Nintendo",
    );
    expect(nintendo).toMatchObject({ platformCount: 1, gameCount: 120 });
    expect(nintendo.platforms).toHaveLength(1);
    // Bounded composition: first page + one follow-up, nothing per item.
    expect(seenUrls).toHaveLength(2);
  });

  it("requires authentication", async () => {
    const response = await families(
      new NextRequest("http://localhost/api/atp/families"),
    );
    expect(response.status).toBe(401);
  });

  it("maps ATP failures to ATP_UNAVAILABLE", async () => {
    stubAtp(() => jsonResponse({ error: { code: "BOOM" } }, 500));
    const token = await tokenFor();
    const response = await families(authed("/api/atp/families", token));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ATP_UNAVAILABLE");
  });
});

describe("groupPlatformsByFamily", () => {
  it("buckets missing families under Outras and sorts deterministically", () => {
    const groups = groupPlatformsByFamily([
      // @ts-expect-error partial fixture: only grouping fields matter
      { name: "Zeta", family: null, gameCount: 1 },
      // @ts-expect-error partial fixture: only grouping fields matter
      { name: "Alpha", family: "Nintendo", gameCount: 2 },
      // @ts-expect-error partial fixture: only grouping fields matter
      { name: "Beta", family: "Nintendo", gameCount: 3 },
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Nintendo", "Outras"]);
    const nintendo = groups[0];
    expect(nintendo.platformCount).toBe(2);
    expect(nintendo.gameCount).toBe(5);
    expect(nintendo.platforms.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });
});
