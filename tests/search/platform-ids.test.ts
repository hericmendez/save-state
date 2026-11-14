/**
 * Parte B — explicit IGDB platform ids (unit + provider + BFF).
 *
 * Behavioral coverage: every provider test asserts the Apicalypse
 * payload really received by IGDB, and the BFF test asserts the same
 * through `GET /api/search`. No source-pattern assertions.
 */

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
import { searchQuerySchema } from "@/schemas/search";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import {
  IgdbSearchProvider,
  __resetIgdbFilterCaches,
} from "@/server/search/igdb-provider";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import {
  applyFixedContext,
  buildAtpBffSearchString,
  hasAtpSearch,
  parseAtpSearchQuery,
  serializeAtpSearchQuery,
} from "@/features/atp/atp-search-query";
import {
  findEditorialPlatform,
  resolveEditorialIgdbIds,
} from "@/features/catalog/editorial-platforms";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

const SOURCE_RECORD: Record<string, string | undefined> = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:1337",
  SEARCH_METHOD: "IGDB",
  TWITCH_CLIENT_ID: "cid",
  TWITCH_CLIENT_SECRET: "secret",
};

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

const JAGUAR_GAME = {
  id: 999,
  name: "Alien vs Predator",
  slug: "alien-vs-predator-jaguar",
  summary: "Jaguar classic.",
  first_release_date: 788918400,
  genres: [{ id: 5, name: "Shooter" }],
  platforms: [{ id: 62, name: "Atari Jaguar" }],
  involved_companies: [],
  cover: { id: 1, url: "//images.igdb.com/igdb/image/upload/t_thumb/xyz.jpg", image_id: "xyz" },
  game_type: 0,
};

function gamesHandler(req: { url: string; body: string }) {
  if (req.url.includes("oauth2/token")) return tokenPayload();
  if (req.url.endsWith("/games/count")) return { count: 1 };
  return [JAGUAR_GAME];
}

function gamesBody(requests: Array<{ url: string; body: string }>) {
  return requests.find((r) => r.url.endsWith("/games"))?.body ?? "";
}

describe("searchQuerySchema platformIds (Parte B)", () => {
  it("parses a comma-separated id list with dedup", () => {
    expect(searchQuerySchema.safeParse({ platformIds: "62,410" }).success).toBe(
      true,
    );
    const parsed = searchQuerySchema.parse({ platformIds: "62,62,410" });
    expect(parsed.platformIds).toEqual([62, 410]);
    expect(searchQuerySchema.parse({ platformIds: "130" }).platformIds).toEqual(
      [130],
    );
  });

  it("rejects non-numeric, non-positive and oversized input", () => {
    for (const bad of ["abc", "0", "-3", "1.5", "62,", "", "62 410"]) {
      expect(
        searchQuerySchema.safeParse({ platformIds: bad }).success,
        bad,
      ).toBe(false);
    }
    const tooMany = Array.from({ length: 51 }, (_, i) => String(i + 1)).join(
      ",",
    );
    expect(searchQuerySchema.safeParse({ platformIds: tooMany }).success).toBe(
      false,
    );
  });

  it("treats ids as a filter for the q-or-filter requirement", () => {
    expect(
      searchQuerySchema.safeParse({ platformIds: "62" }).success,
    ).toBe(true);
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("fixed platformIds in atp-search-query (Parte B)", () => {
  it("is never parsed from the public page URL", () => {
    const query = parseAtpSearchQuery({ platformIds: "62" } as never);
    expect(query.platformIds).toBeUndefined();
  });

  it("is never serialized into the page URL", () => {
    const serialized = serializeAtpSearchQuery({
      search: "",
      platform: "Atari Jaguar",
      platformIds: [62],
    });
    expect(serialized).not.toContain("platformIds");
    expect(serialized).toContain("platform=");
  });

  it("travels to the BFF while fixed context prevails", () => {
    const next = applyFixedContext(
      { ...parseAtpSearchQuery({}), platformIds: [1] },
      { platform: "Atari Jaguar", platformIds: [62, 410] },
    );
    expect(next.platformIds).toEqual([62, 410]);
    expect(next.platform).toBe("Atari Jaguar");
    const bff = buildAtpBffSearchString(next);
    expect(bff).toContain("platformIds=");
    const decoded = decodeURIComponent(bff);
    expect(decoded).toContain("platformIds=62,410");
  });

  it("counts as a submitted search on its own", () => {
    expect(
      hasAtpSearch({ ...parseAtpSearchQuery({}), platformIds: [62] }),
    ).toBe(true);
  });
});

describe("IgdbSearchProvider with explicit platformIds (Parte B)", () => {
  afterEach(() => {
    __resetServerEnvCache();
    __resetTwitchTokenCache();
    __resetIgdbThrottle();
    __resetIgdbFilterCaches();
    vi.unstubAllGlobals();
  });

  it("filters by a single explicit id outside the fixed catalog", async () => {
    const requests = mockIgdb(gamesHandler);
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "", page: 1, limit: 20, platform: "Atari Jaguar", platformIds: [62] },
      { ...SOURCE_RECORD },
    );
    expect(gamesBody(requests)).toContain("platforms = (62)");
    expect(page.data).toHaveLength(1);
  });

  it("propagates multiple ids with dedup", async () => {
    const requests = mockIgdb(gamesHandler);
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      { q: "", page: 1, limit: 20, platformIds: [62, 410, 62] },
      { ...SOURCE_RECORD },
    );
    expect(gamesBody(requests)).toContain("platforms = (62,410)");
  });

  it("unions explicit ids with the preserved name resolution", async () => {
    const requests = mockIgdb(gamesHandler);
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      {
        q: "",
        page: 1,
        limit: 20,
        platform: "Nintendo Switch",
        platformIds: [130],
      },
      { ...SOURCE_RECORD },
    );
    expect(gamesBody(requests)).toContain("platforms = (130)");
  });

  it("returns empty without IGDB calls for invalid-only ids", async () => {
    const requests = mockIgdb(gamesHandler);
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "", page: 1, limit: 20, platformIds: [0, -5] },
      { ...SOURCE_RECORD },
    );
    expect(page.data).toEqual([]);
    expect(page.pagination.total).toBe(0);
    expect(requests.some((r) => r.url.endsWith("/games"))).toBe(false);
  });

  it("keeps the unknown-name empty page without IGDB calls", async () => {
    const requests = mockIgdb(gamesHandler);
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "", page: 1, limit: 20, platform: "Neo Geo AES" },
      { ...SOURCE_RECORD },
    );
    expect(page.data).toEqual([]);
    expect(requests.some((r) => r.url.endsWith("/games"))).toBe(false);
  });

  it("applies other filters alongside explicit ids", async () => {
    const requests = mockIgdb(gamesHandler);
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      {
        q: "avp",
        page: 1,
        limit: 20,
        platformIds: [62],
        yearMin: 1994,
        yearMax: 1994,
      },
      { ...SOURCE_RECORD },
    );
    const body = gamesBody(requests);
    expect(body).toContain("platforms = (62)");
    expect(body).toContain('search "avp"');
    expect(body).toContain("first_release_date >=");
  });

  it.each([
    ["nintendo-switch", "Nintendo Switch", "(130)"],
    ["nintendo-3ds", "Nintendo 3DS", "(37)"],
    ["pc-dos", "DOS", "(13)"],
    ["atari-jaguar", "Atari Jaguar", "(62)"],
    ["atari-lynx", "Atari Lynx", "(61)"],
    ["pc-amiga", "Amiga", "(16)"],
  ])("editorial %s filters by %s", async (slug, name, clause) => {
    const requests = mockIgdb(gamesHandler);
    const editorial = findEditorialPlatform(slug);
    if (!editorial) throw new Error(`${slug} missing`);
    const ids = resolveEditorialIgdbIds(editorial);
    expect(ids.length).toBeGreaterThan(0);
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      { q: "", page: 1, limit: 20, platform: name, platformIds: ids },
      { ...SOURCE_RECORD },
    );
    expect(gamesBody(requests)).toContain(`platforms = ${clause}`);
  });

  it("never issues a generic unfiltered query for Neo Geo AES", async () => {
    const requests = mockIgdb(gamesHandler);
    const editorial = findEditorialPlatform("neo-geo");
    if (!editorial) throw new Error("neo-geo missing");
    expect(resolveEditorialIgdbIds(editorial)).toEqual([]);
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "", page: 1, limit: 20, platform: editorial.name },
      { ...SOURCE_RECORD },
    );
    expect(page.data).toEqual([]);
    expect(requests.some((r) => r.url.endsWith("/games"))).toBe(false);
  });
});

describe("GET /api/search with platformIds (Parte B, IGDB)", () => {
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

  function stubBffFetch(
    requests: Array<{ url: string; body: string }>,
  ): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const body = String((init as RequestInit | undefined)?.body ?? "");
        requests.push({ url, body });
        const payload = (data: unknown) =>
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        if (url.includes("oauth2/token")) {
          return payload({ access_token: "tok", expires_in: 3600 });
        }
        if (url.endsWith("/games/count")) return payload({ count: 1 });
        if (url.endsWith("/games")) return payload([JAGUAR_GAME]);
        if (url.endsWith("/platforms")) return payload([]);
        if (url.endsWith("/involved_companies")) return payload([]);
        if (url.endsWith("/companies")) return payload([]);
        if (url.endsWith("/genres")) return payload([]);
        throw new Error(`unexpected IGDB call: ${url}`);
      }),
    );
  }

  it("filters by validated ids end to end", async () => {
    const token = await tokenFor();
    const requests: Array<{ url: string; body: string }> = [];
    stubBffFetch(requests);
    const response = await neutralSearch(
      authedRequest("http://localhost/api/search?platformIds=62", token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(
      requests.find((r) => r.url.endsWith("/games"))?.body,
    ).toContain("platforms = (62)");
  });

  it("preserves the name filter without ids", async () => {
    const token = await tokenFor();
    const requests: Array<{ url: string; body: string }> = [];
    stubBffFetch(requests);
    const response = await neutralSearch(
      authedRequest(
        "http://localhost/api/search?platform=Nintendo%20Switch",
        token,
      ),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(200);
    expect(
      requests.find((r) => r.url.endsWith("/games"))?.body,
    ).toContain("platforms = (130)");
  });

  it("rejects invalid ids with INVALID_QUERY", async () => {
    const token = await tokenFor();
    const requests: Array<{ url: string; body: string }> = [];
    stubBffFetch(requests);
    const response = await neutralSearch(
      authedRequest("http://localhost/api/search?platformIds=abc", token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_QUERY");
    expect(requests.some((r) => r.url.endsWith("/games"))).toBe(false);
  });
});
