/**
 * Fase 1 — cover URL no payload + cancelamento de obsoletas.
 *
 * Behavioral coverage: asserts the payloads really exchanged
 * (provider → BFF → card), not source strings — except for the
 * client-component abort wiring, which follows the repo's
 * source-pattern convention (no DOM infra in vitest).
 */

import { readFileSync } from "fs";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as neutralSearch } from "@/app/api/search/route";
import { __resetServerEnvCache } from "@/lib/env";
import { AtpSearchProvider } from "@/server/search/atp-provider";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import {
  IgdbSearchProvider,
  __resetIgdbFilterCaches,
} from "@/server/search/igdb-provider";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import { shouldResolveCover } from "@/features/atp/use-atp-cover";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

const SOURCE = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:1337",
  SEARCH_METHOD: "IGDB",
  TWITCH_CLIENT_ID: "cid",
  TWITCH_CLIENT_SECRET: "secret",
  ATP_BASE_URL: "http://atp.test",
} as const;

const SOURCE_RECORD: Record<string, string | undefined> = { ...SOURCE };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockIgdb(handler: (req: { url: string; body: string }) => unknown) {
  const requests: Array<{ url: string; body: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const captured = { url, body: String(init?.body ?? "") };
      requests.push(captured);
      return {
        ok: true,
        status: 200,
        json: async () => handler(captured),
      };
    }),
  );
  return requests;
}

function tokenPayload() {
  return { access_token: "tok", expires_in: 3600 };
}

function igdbGame(id: number, withCover: boolean) {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    first_release_date: 798595200,
    genres: [],
    platforms: [{ id: 130, name: "Nintendo Switch" }],
    involved_companies: [],
    cover: withCover
      ? { id, image_id: `img${id}` }
      : null,
    game_type: 0,
  };
}

const ATP_GAME = {
  id: "atp-game-1",
  titles: [{ value: "ATP Game", type: "primary" }],
  releases: [],
  developers: [],
  publishers: [],
  genres: [],
  externalIdentifiers: [],
};

describe("shouldResolveCover", () => {
  it("resolves on demand only when the payload carried nothing", () => {
    expect(shouldResolveCover(undefined)).toBe(true);
    expect(shouldResolveCover("https://img.example/c.jpg")).toBe(false);
    expect(shouldResolveCover(null)).toBe(false);
  });
});

describe("coverUrl in search cards (Fase 1)", () => {
  afterEach(() => {
    __resetServerEnvCache();
    __resetTwitchTokenCache();
    __resetIgdbThrottle();
    __resetIgdbFilterCaches();
    vi.unstubAllGlobals();
  });

  it("IGDB cards carry the payload cover URL (string)", async () => {
    mockIgdb((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 1 };
      return [igdbGame(1, true)];
    });
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "game", page: 1, limit: 20 },
      { ...SOURCE_RECORD },
    );
    expect(page.data[0].coverUrl).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/img1.jpg",
    );
  });

  it("IGDB cards carry null when the game has no cover (no fetch needed)", async () => {
    mockIgdb((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 1 };
      return [igdbGame(2, false)];
    });
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "game", page: 1, limit: 20 },
      { ...SOURCE_RECORD },
    );
    expect(page.data[0].coverUrl).toBeNull();
  });

  it("ATP cards omit coverUrl (on-demand resolution preserved)", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/save-state";
    process.env.JWT_SECRET = "a".repeat(32);
    process.env.APP_URL = "http://localhost:1337";
    process.env.ATP_BASE_URL = "http://atp.test";
    __resetServerEnvCache();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse({
            data: [ATP_GAME],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
          }),
        ),
      );
      const provider = new AtpSearchProvider();
      const page = await provider.searchGames({
        q: "atp",
        page: 1,
        limit: 20,
      });
      expect(page.data).toHaveLength(1);
      expect("coverUrl" in page.data[0]).toBe(false);
    } finally {
      delete process.env.MONGODB_URI;
      delete process.env.JWT_SECRET;
      delete process.env.APP_URL;
      delete process.env.ATP_BASE_URL;
      __resetServerEnvCache();
    }
  });

  it("a 20-result IGDB page needs no per-card IGDB calls", async () => {
    const requests = mockIgdb((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 20 };
      return Array.from({ length: 20 }, (_, i) => igdbGame(i + 1, true));
    });
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "", page: 1, limit: 20, platform: "Nintendo Switch" },
      { ...SOURCE_RECORD },
    );
    expect(page.data).toHaveLength(20);
    expect(page.data.every((c) => typeof c.coverUrl === "string")).toBe(true);
    const gamesCalls = requests.filter((r) => r.url.endsWith("/games"));
    const countCalls = requests.filter((r) =>
      r.url.endsWith("/games/count"),
    );
    expect(gamesCalls).toHaveLength(1);
    expect(countCalls).toHaveLength(1);
  });
});

describe("catalog abort wiring (Fase 1, source contract)", () => {
  const p = "features/atp/catalog-search.tsx";
  const content = readFileSync(p, "utf8");

  it("aborts the previous search and silences AbortError", () => {
    for (const pattern of [
      "abortRef = useRef<AbortController | null>(null)",
      "abortRef.current?.abort()",
      "new AbortController()",
      "{ signal: controller.signal }",
      'name === "AbortError"',
      "useEffect(() => () => abortRef.current?.abort(), [])",
      "requestIdRef",
    ]) {
      expect(content.includes(pattern), pattern).toBe(true);
    }
  });

  it("passes the known cover URL instead of fetching (grid + table)", () => {
    for (const row of [
      "features/atp/catalog-search.tsx",
      "features/atp/catalog-table-row.tsx",
    ]) {
      expect(readFileSync(row, "utf8")).toContain(
        "useAtpCover(card.atpId, card.coverUrl)",
      );
    }
  });
});

describe("GET /api/search carries coverUrl for a 20-result page", () => {
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
    process.env.SEARCH_METHOD = "IGDB";
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

  it("every card carries a usable coverUrl", async () => {
    const token = await tokenFor();
    const requests: Array<{ url: string; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const body = String((init as RequestInit | undefined)?.body ?? "");
        requests.push({ url, body });
        if (url.includes("oauth2/token")) {
          return jsonResponse({ access_token: "tok", expires_in: 3600 });
        }
        if (url.endsWith("/games/count")) return jsonResponse({ count: 20 });
        if (url.endsWith("/games")) {
          return jsonResponse(
            Array.from({ length: 20 }, (_, i) => igdbGame(i + 1, true)),
          );
        }
        if (url.endsWith("/platforms")) return jsonResponse([]);
        if (url.endsWith("/involved_companies")) return jsonResponse([]);
        if (url.endsWith("/companies")) return jsonResponse([]);
        if (url.endsWith("/genres")) return jsonResponse([]);
        throw new Error(`unexpected IGDB call: ${url}`);
      }),
    );
    const response = await neutralSearch(
      authedRequest(
        "http://localhost/api/search?platform=Nintendo%20Switch",
        token,
      ) as NextRequest,
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(20);
    expect(
      body.data.every(
        (c: { coverUrl?: string | null }) => typeof c.coverUrl === "string",
      ),
    ).toBe(true);
    // Exactly one games + one count call: zero per-card cover fetches.
    expect(requests.filter((r) => r.url.endsWith("/games"))).toHaveLength(1);
    expect(requests.filter((r) => r.url.endsWith("/games/count"))).toHaveLength(1);
  });
});
