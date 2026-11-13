import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as neutralSearch } from "@/app/api/search/route";
import { GET as neutralDetail } from "@/app/api/search/games/[id]/route";
import { POST as neutralImport } from "@/app/api/search/import/route";
import { GET as neutralPlatforms } from "@/app/api/search/platforms/route";
import { __resetServerEnvCache } from "@/lib/env";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import { __resetIgdbFilterCaches } from "@/server/search/igdb-provider";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { ATP_GAME_FIXTURE } from "../atp/client.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const IGDB_GAME = {
  id: 1234,
  name: "Chrono Trigger",
  summary: "A time-travel RPG.",
  first_release_date: 798595200,
  genres: [{ id: 12, name: "Role-playing (RPG)" }],
  platforms: [{ id: 19, name: "Super Nintendo Entertainment System" }],
  involved_companies: [],
  cover: { id: 1, image_id: "abc" },
  game_type: 0,
};

beforeAll(async () => {
  await startTestDatabase();
});
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  __resetIgdbThrottle();
  __resetIgdbFilterCaches();
  process.env.ATP_BASE_URL = "http://atp.test";
  process.env.SEARCH_METHOD = "ATP";
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  delete process.env.SEARCH_METHOD;
});

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
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

function stubAtpFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const parsed = new URL(url);
      const path = parsed.pathname;
      if (path === "/api/v1/games/search" || path === "/api/v1/games") {
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }
      if (path === `/api/v1/games/${ATP_GAME_FIXTURE.id}/cover`) {
        return jsonResponse({
          data: {
            gameId: ATP_GAME_FIXTURE.id,
            selected: { url: "https://img.example/c.jpg", width: 1, height: 1, source: "x" },
            candidates: [],
          },
        });
      }
      if (path === `/api/v1/games/${ATP_GAME_FIXTURE.id}`) {
        return jsonResponse({ data: ATP_GAME_FIXTURE });
      }
      throw new Error(`unexpected ATP call: ${url}`);
    }),
  );
}

function stubIgdbFetch(): void {
  process.env.SEARCH_METHOD = "IGDB";
  process.env.TWITCH_CLIENT_ID = "cid";
  process.env.TWITCH_CLIENT_SECRET = "secret";
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 });
      }
      const body = String(init?.body ?? "");
      if (url.endsWith("/games/count")) return jsonResponse({ count: 1 });
      if (url.endsWith("/games")) {
        if (body.includes("cover.image_id") && !body.includes("name,")) {
          return jsonResponse([{ id: 1234, cover: { id: 1, image_id: "abc" } }]);
        }
        return jsonResponse([IGDB_GAME]);
      }
      if (url.endsWith("/platforms")) return jsonResponse([]);
      if (url.endsWith("/involved_companies")) return jsonResponse([]);
      if (url.endsWith("/companies")) return jsonResponse([]);
      if (url.endsWith("/genres")) return jsonResponse([]);
      throw new Error(`unexpected IGDB call: ${url} :: ${body.slice(0, 80)}`);
    }),
  );
}

describe("neutral /api/search/* with SEARCH_METHOD=ATP", () => {
  it("serves search through the neutral namespace", async () => {
    const token = await tokenFor();
    stubAtpFetch();
    const response = await neutralSearch(
      authedRequest("http://localhost/api/search?q=chrono", token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ name: "Chrono Trigger", owned: false });
    expect(typeof body.data[0].atpId).toBe("string");
    expect(body.pagination.hasNextPage).toBe(false);
  });

  it("serves detail through the neutral namespace", async () => {
    const token = await tokenFor();
    stubAtpFetch();
    const response = await neutralDetail(
      authedRequest(`/api/search/games/${ATP_GAME_FIXTURE.id}`, token),
      { params: Promise.resolve({ id: ATP_GAME_FIXTURE.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ name: "Chrono Trigger", owned: false });
  });

  it("imports through the neutral namespace preserving the ATP origin", async () => {
    const token = await tokenFor();
    stubAtpFetch();
    const response = await neutralImport(
      authedRequest("/api/search/import", token, {
        method: "POST",
        body: { externalId: ATP_GAME_FIXTURE.id },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.game.source).toBe("atp");
    expect(body.data.game.atpDomainId).toBe(ATP_GAME_FIXTURE.id);
  });
});

describe("neutral /api/search/* with SEARCH_METHOD=IGDB", () => {
  it("serves search from IGDB through the same contract", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await neutralSearch(
      authedRequest("http://localhost/api/search?q=chrono", token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ id: "1234", name: "Chrono Trigger", owned: false });
  });

  it("serves platforms from the Save State catalog", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await neutralPlatforms(
      authedRequest("/api/search/platforms?limit=5", token),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBeGreaterThan(50);
    expect(body.data[0]).toHaveProperty("company");
  });
});
