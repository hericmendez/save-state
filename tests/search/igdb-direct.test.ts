import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as igdbSearch } from "@/app/api/igdb/search/route";
import { GET as igdbDetail } from "@/app/api/igdb/games/[id]/route";
import { GET as igdbCovers } from "@/app/api/igdb/covers/search/route";
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubIgdbFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 });
      }
      expect(url.startsWith("https://api.igdb.com")).toBe(true);
      const body = String(init?.body ?? "");
      if (url.endsWith("/games/count")) return jsonResponse({ count: 1 });
      if (url.endsWith("/games")) {
        if (body.includes("where id = 404")) return jsonResponse([]);
        return jsonResponse([IGDB_GAME]);
      }
      if (url.endsWith("/involved_companies")) return jsonResponse([]);
      if (url.endsWith("/companies")) return jsonResponse([]);
      if (url.endsWith("/genres")) return jsonResponse([]);
      throw new Error(`unexpected IGDB call: ${url}`);
    }),
  );
}

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
  // Novo Jogo lookups ignore the catalog provider on purpose.
  process.env.SEARCH_METHOD = "ATP";
  process.env.ATP_BASE_URL = "http://atp.test";
  process.env.TWITCH_CLIENT_ID = "cid";
  process.env.TWITCH_CLIENT_SECRET = "secret";
});
afterEach(() => {
  vi.unstubAllGlobals();
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  delete process.env.SEARCH_METHOD;
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
});

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(
    postRequest("/api/auth/login", { email: TEST_USER.email, password: TEST_USER.password }),
  );
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

describe("Etapa 5 — /api/igdb/* always uses IGDB", () => {
  it("searches IGDB even when SEARCH_METHOD=ATP", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await igdbSearch(
      authedRequest("/api/igdb/search?q=chrono", token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ id: "1234", name: "Chrono Trigger" });
  });

  it("returns IGDB detail for the metadata form patch", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await igdbDetail(authedRequest("/api/igdb/games/1234", token), {
      params: Promise.resolve({ id: "1234" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: "1234",
      name: "Chrono Trigger",
      summary: "A time-travel RPG.",
      coverUrl: expect.stringContaining("images.igdb.com"),
    });
  });

  it("returns IGDB cover candidates", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await igdbCovers(
      authedRequest("/api/igdb/covers/search?q=chrono", token),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([
      {
        url: expect.stringContaining("images.igdb.com"),
        width: null,
        height: null,
        source: "igdb",
      },
    ]);
  });

  it("propagates IGDB unavailability without falling back to ATP", async () => {
    const token = await tokenFor();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("oauth2/token")) {
          return jsonResponse({ access_token: "tok", expires_in: 3600 });
        }
        return { ok: false, status: 502, json: async () => ({}) } as Response;
      }),
    );
    const response = await igdbSearch(
      authedRequest("/api/igdb/search?q=chrono", token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("IGDB_UNAVAILABLE");
  });
});

describe("Etapa 2 — family leaves the general search URL (route-locked only)", () => {
  it("ignores a free family URL param but keeps the route-locked context", async () => {
    const { parseAtpSearchQuery, serializeWithFixedContext, applyFixedContext, toAtpBffParams } =
      await import("@/features/atp/atp-search-query");
    // §3.6: no free family filter in the general search — a `family` URL
    // param outside a family detail page is ignored, never a filter.
    const query = parseAtpSearchQuery(
      new URLSearchParams("search=mario&family=Nintendo&page=2"),
    );
    expect(query.family).toBe("");
    // Family detail pages lock the filter as route context (unchanged).
    const fixed = applyFixedContext(query, { family: "Nintendo" });
    expect(fixed.family).toBe("Nintendo");
    expect(toAtpBffParams(fixed).family).toBe("Nintendo");
    const serialized = serializeWithFixedContext(fixed, { family: "Nintendo" });
    expect(serialized).not.toContain("family=");
  });
});
