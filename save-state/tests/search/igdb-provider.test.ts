import { afterEach, describe, expect, it, vi } from "vitest";
import { IgdbSearchProvider, __resetIgdbFilterCaches } from "@/server/search/igdb-provider";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import { __resetServerEnvCache } from "@/lib/env";

const SOURCE = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:1337",
  SEARCH_METHOD: "IGDB",
  TWITCH_CLIENT_ID: "cid",
  TWITCH_CLIENT_SECRET: "secret",
} as const;

const SOURCE_RECORD: Record<string, string | undefined> = { ...SOURCE };

afterEach(() => {
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  __resetIgdbThrottle();
  __resetIgdbFilterCaches();
  vi.unstubAllGlobals();
});

interface CapturedRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function mockFetch(handler: (req: CapturedRequest) => unknown) {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const captured = {
        url,
        body: String(init?.body ?? ""),
        headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      };
      requests.push(captured);
      const payload = await handler(captured);
      return { ok: true, status: 200, json: async () => payload };
    }),
  );
  return requests;
}

function tokenPayload() {
  return { access_token: "tok", expires_in: 3600 };
}

const CHRONO_GAME = {
  id: 1234,
  name: "Chrono Trigger",
  slug: "chrono-trigger",
  summary: "A time-travel RPG.",
  first_release_date: 798595200,
  genres: [{ id: 12, name: "Role-playing (RPG)" }],
  platforms: [{ id: 19, name: "Super Nintendo Entertainment System" }],
  involved_companies: [10],
  cover: { id: 1, url: "//images.igdb.com/igdb/image/upload/t_thumb/abc.jpg", image_id: "abc" },
  game_type: 0,
};

describe("Etapa 3 — IgdbSearchProvider.searchGames", () => {
  it("maps IGDB games to the neutral card contract", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      return [CHRONO_GAME];
    });
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "chrono", page: 1, limit: 20 },
      SOURCE_RECORD,
    );
    expect(page.data).toEqual([
      {
        id: "1234",
        name: "Chrono Trigger",
        year: 1995,
        platforms: ["Super Nintendo Entertainment System"],
        genres: ["Role-playing (RPG)"],
      },
    ]);
    const gamesCall = requests.find((r) => r.url.endsWith("/games"));
    expect(gamesCall?.headers["Client-ID"]).toBe("cid");
    expect(gamesCall?.headers.Authorization).toBe("Bearer tok");
    expect(gamesCall?.body).toContain('search "chrono"');
    expect(gamesCall?.body).toContain("game_type = (0,4,8,9,10)");
    expect(page.pagination.hasNextPage).toBe(false);
    expect(page.pagination.hasPreviousPage).toBe(false);
  });

  it("derives hasNext by over-fetching one row", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 3 };
      return [CHRONO_GAME, { ...CHRONO_GAME, id: 2 }, { ...CHRONO_GAME, id: 3 }];
    });
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "a", page: 1, limit: 2 },
      SOURCE_RECORD,
    );
    expect(page.data.map((c) => c.id)).toEqual(["1234", "2"]);
    expect(page.pagination.hasNextPage).toBe(true);
  });

  it("translates platform names to IGDB ids", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 1 };
      return [CHRONO_GAME];
    });
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      { q: "", page: 1, limit: 20, platform: "Nintendo Switch" },
      SOURCE_RECORD,
    );
    const gamesCall = requests.find((r) => r.url.endsWith("/games"));
    expect(gamesCall?.body).toContain("platforms = (130)");
    expect(gamesCall?.body).not.toContain("search ");
  });

  it("returns an empty page without IGDB calls for unknown platforms", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      return [CHRONO_GAME];
    });
    const provider = new IgdbSearchProvider();
    const page = await provider.searchGames(
      { q: "", page: 1, limit: 20, platform: "iOS" },
      SOURCE_RECORD,
    );
    expect(page.data).toEqual([]);
    expect(page.pagination.total).toBe(0);
    expect(requests.some((r) => r.url.endsWith("/games"))).toBe(false);
  });

  it("translates family filters to platform id unions", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 0 };
      return [];
    });
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      { q: "", page: 1, limit: 20, family: "Sony" },
      SOURCE_RECORD,
    );
    const gamesCall = requests.find((r) => r.url.endsWith("/games"));
    expect(gamesCall?.body).toContain("platforms = (7,8,9,38,46,48,167)");
  });

  it("translates year filters to unix ranges", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 0 };
      return [];
    });
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      { q: "", page: 1, limit: 20, yearMin: 1995, yearMax: 1995 },
      SOURCE_RECORD,
    );
    const gamesCall = requests.find((r) => r.url.endsWith("/games"));
    expect(gamesCall?.body).toContain("first_release_date >=");
  });

  it("resolves genre names live before filtering", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/genres"))
        return [{ id: 12, name: "Role-playing (RPG)" }];
      if (req.url.endsWith("/games/count")) return { count: 0 };
      return [];
    });
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      { q: "", page: 1, limit: 20, genre: "Role-playing (RPG)" },
      SOURCE_RECORD,
    );
    const gamesCall = requests.find((r) => r.url.endsWith("/games"));
    expect(gamesCall?.body).toContain("genres = (12)");
  });

  it("resolves developer names via companies + involvements", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/companies")) return [{ id: 1, name: "Square" }];
      if (req.url.endsWith("/involved_companies"))
        return [{ id: 10, company: 1, developer: true, publisher: false }];
      if (req.url.endsWith("/games/count")) return { count: 0 };
      return [];
    });
    const provider = new IgdbSearchProvider();
    await provider.searchGames(
      { q: "", page: 1, limit: 20, developer: "Square" },
      SOURCE_RECORD,
    );
    const gamesCall = requests.find((r) => r.url.endsWith("/games"));
    expect(gamesCall?.body).toContain("involved_companies = (10)");
  });

  it("maps 429 to RATE_LIMIT_EXCEEDED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("oauth2/token"))
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 3600 }),
          };
        return { ok: false, status: 429, json: async () => ({}) };
      }),
    );
    const provider = new IgdbSearchProvider();
    await expect(
      provider.searchGames({ q: "x", page: 1, limit: 20 }, SOURCE_RECORD),
    ).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED" });
  });

  it("maps 5xx to IGDB_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("oauth2/token"))
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 3600 }),
          };
        return { ok: false, status: 502, json: async () => ({}) };
      }),
    );
    const provider = new IgdbSearchProvider();
    await expect(
      provider.searchGames({ q: "x", page: 1, limit: 20 }, SOURCE_RECORD),
    ).rejects.toMatchObject({ code: "IGDB_UNAVAILABLE" });
  });
});

describe("Etapa 2 — native sort and year-range clauses", () => {
  function mockEmpty() {
    return mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/genres"))
        return [{ id: 12, name: "Role-playing (RPG)" }];
      if (req.url.endsWith("/games/count")) return { count: 0 };
      return [];
    });
  }

  function gamesBody(requests: { url: string; body: string }[]): string {
    const call = requests.find((r) => r.url.endsWith("/games"));
    if (!call) throw new Error("expected a POST /games call");
    return call.body;
  }

  it("keeps relevance (text without sort) free of any sort clause", async () => {
    const requests = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "chrono", page: 1, limit: 20 },
      SOURCE_RECORD,
    );
    expect(gamesBody(requests)).not.toContain("sort ");
  });

  it("sorts titles ASC by default and honors an explicit DESC", async () => {
    const defaulted = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "", page: 1, limit: 20, sortBy: "title" },
      SOURCE_RECORD,
    );
    expect(gamesBody(defaulted)).toContain("sort name asc");

    const explicit = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "mario", page: 1, limit: 20, sortBy: "title", order: "desc" },
      SOURCE_RECORD,
    );
    expect(gamesBody(explicit)).toContain("sort name desc");
  });

  it("sorts years DESC by default and honors an explicit ASC", async () => {
    const defaulted = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "", page: 1, limit: 20, sortBy: "year" },
      SOURCE_RECORD,
    );
    expect(gamesBody(defaulted)).toContain("sort first_release_date desc");

    const explicit = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "", page: 1, limit: 20, sortBy: "year", order: "asc" },
      SOURCE_RECORD,
    );
    expect(gamesBody(explicit)).toContain("sort first_release_date asc");
  });

  it("converts year bounds to inclusive unix timestamps", async () => {
    const requests = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "", page: 1, limit: 20, yearMin: 2000, yearMax: 2010 },
      SOURCE_RECORD,
    );
    const body = gamesBody(requests);
    expect(body).toContain(`first_release_date >= ${Date.UTC(2000, 0, 1) / 1000}`);
    expect(body).toContain(`first_release_date < ${Date.UTC(2011, 0, 1) / 1000}`);
  });

  it("supports open-ended ranges (min-only and max-only)", async () => {
    const minOnly = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "", page: 1, limit: 20, yearMin: 2000 },
      SOURCE_RECORD,
    );
    const minBody = gamesBody(minOnly);
    expect(minBody).toContain("first_release_date >=");
    expect(minBody).not.toContain("first_release_date <");

    const maxOnly = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      { q: "", page: 1, limit: 20, yearMax: 2010 },
      SOURCE_RECORD,
    );
    const maxBody = gamesBody(maxOnly);
    expect(maxBody).not.toContain("first_release_date >=");
    expect(maxBody).toContain("first_release_date <");
  });

  it("combines title text and filters with AND before pagination", async () => {
    const requests = mockEmpty();
    await new IgdbSearchProvider().searchGames(
      {
        q: "Zelda",
        page: 2,
        limit: 20,
        platform: "Nintendo Switch",
        genre: "Role-playing (RPG)",
        yearMin: 2000,
        yearMax: 2010,
        sortBy: "year",
        order: "desc",
      },
      SOURCE_RECORD,
    );
    const body = gamesBody(requests);
    expect(body).toContain('search "Zelda"');
    expect(body).toContain("platforms = (130)");
    expect(body).toContain("genres = (12)");
    expect(body).toContain("first_release_date >=");
    expect(body).toContain("sort first_release_date desc");
    expect(body).toContain("offset 20");
  });
});

describe("Etapa 3 — IgdbSearchProvider detail/cover/covers", () => {
  it("returns neutral detail with companies, releases and summary", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games"))
        return [
          {
            ...CHRONO_GAME,
            release_dates: [
              { platform: { id: 19, name: "Super Nintendo Entertainment System" }, date: 798595200, region: 2 },
            ],
          },
        ];
      if (req.url.endsWith("/involved_companies"))
        return [{ id: 10, company: 1, developer: true, publisher: false }];
      if (req.url.endsWith("/companies")) return [{ id: 1, name: "Square" }];
      return [];
    });
    const provider = new IgdbSearchProvider();
    const detail = await provider.getGameDetail("1234", SOURCE_RECORD);
    expect(detail).toMatchObject({
      id: "1234",
      name: "Chrono Trigger",
      year: 1995,
      summary: "A time-travel RPG.",
      developers: ["Square"],
      publishers: [],
      coverUrl:
        "https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg",
      externalIdentifiers: [{ source: "igdb", id: "1234" }],
    });
    expect(detail.releases[0]).toMatchObject({
      platform: "Super Nintendo Entertainment System",
      region: "North America",
      year: 1995,
    });
  });

  it("never interprets an ATP id as IGDB (404 without network)", async () => {
    const requests = mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      return [];
    });
    const provider = new IgdbSearchProvider();
    await expect(
      provider.getGameDetail("atp-wikipedia-123", SOURCE_RECORD),
    ).rejects.toMatchObject({ code: "IGDB_GAME_NOT_FOUND" });
    expect(requests.some((r) => r.url.endsWith("/games"))).toBe(false);
  });

  it("returns 404 for unknown numeric ids", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      return [];
    });
    const provider = new IgdbSearchProvider();
    await expect(
      provider.getGameDetail("999999999", SOURCE_RECORD),
    ).rejects.toMatchObject({ code: "IGDB_GAME_NOT_FOUND" });
  });

  it("degrades missing covers to null instead of failing", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      return [{ ...CHRONO_GAME, cover: null }];
    });
    const provider = new IgdbSearchProvider();
    await expect(
      provider.getGameCover("1234", SOURCE_RECORD),
    ).resolves.toBeNull();
  });

  it("returns distinct cover candidates from game search", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      return [
        CHRONO_GAME,
        { ...CHRONO_GAME, id: 2, cover: { image_id: "abc" } },
        { ...CHRONO_GAME, id: 3, cover: null },
      ];
    });
    const provider = new IgdbSearchProvider();
    const covers = await provider.searchCovers(
      { q: "chrono", limit: 6 },
      SOURCE_RECORD,
    );
    expect(covers).toEqual([
      {
        url: "https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg",
        width: null,
        height: null,
        source: "igdb",
      },
    ]);
  });
});

describe("Etapa 3 — IgdbSearchProvider platforms/families", () => {
  it("lists catalog platforms with company filter and pagination", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/platforms"))
        return [
          { id: 130, name: "Nintendo Switch", platform_logo: { url: "//images.igdb.com/igdb/image/upload/t_thumb/sw.jpg" } },
        ];
      return [];
    });
    const provider = new IgdbSearchProvider();
    const result = await provider.listPlatforms(
      { companyName: "endo", page: 1, limit: 50 },
      SOURCE_RECORD,
    );
    expect(result.data.length).toBeGreaterThan(0);
    expect(
      result.data.every((p) => p.company.toLowerCase().includes("endo")),
    ).toBe(true);
    expect(result.pagination.total).toBe(result.data.length);
    const nintendo = result.data.find((p) => p.id === "130");
    expect(nintendo?.thumb?.logo).toContain("t_logo_med");
  });

  it("groups families with platform and game counts", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      return [];
    });
    const provider = new IgdbSearchProvider();
    const families = await provider.listFamilies(SOURCE_RECORD);
    const names = families.map((f) => f.name);
    expect(names).toContain("Nintendo");
    expect(names).toContain("Sony");
    const nintendo = families.find((f) => f.name === "Nintendo");
    expect(nintendo?.platformCount).toBe(nintendo?.platforms.length);
    expect(nintendo?.gameCount).toBeGreaterThan(0);
  });

  it("serves platform detail with a live game count", async () => {
    mockFetch((req) => {
      if (req.url.includes("oauth2/token")) return tokenPayload();
      if (req.url.endsWith("/games/count")) return { count: 4848 };
      if (req.url.endsWith("/platforms")) return [];
      return [];
    });
    const provider = new IgdbSearchProvider();
    const platform = await provider.getPlatform("167", SOURCE_RECORD);
    expect(platform).toMatchObject({
      id: "167",
      name: "PlayStation 5",
      company: "Sony",
      family: "Sony",
      gameCount: 4848,
    });
  });
});
