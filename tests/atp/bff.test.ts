import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as search } from "@/app/api/atp/search/route";
import { GET as detail } from "@/app/api/atp/games/[id]/route";
import { GET as cover } from "@/app/api/atp/games/[id]/cover/route";
import { GET as coversSearch } from "@/app/api/atp/covers/search/route";
import { POST as importGame } from "@/app/api/atp/import/route";
import { GET as listGames } from "@/app/api/games/route";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { ATP_GAME_FIXTURE } from "./client.test";

const ATP_ID = "atp-wikipedia-6509467";

function atpGamePayload() {
  return { data: ATP_GAME_FIXTURE, origin: "database" };
}

function atpCoverPayload(url: string | null = "https://img.example/c.jpg") {
  return {
    data: {
      gameId: ATP_ID,
      selected: url
        ? { url, width: 300, height: 400, source: "steam" }
        : null,
      candidates: [],
    },
    origin: "database",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Route stubbed-ATP fetch calls by path. Unknown paths 404. */
function stubAtp(handler: (path: string) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const path = new URL(url).pathname;
      expect(url.startsWith("http://atp.test")).toBe(true);
      return handler(path);
    }),
  );
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

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
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

describe("GET /api/atp/search", () => {
  it("requires authentication", async () => {
    const response = await search(
      new NextRequest("http://localhost/api/atp/search?q=x"),
    );
    expect(response.status).toBe(401);
  });

  it("returns flattened cards with pagination", async () => {
    stubAtp((path) => {
      if (path === "/api/v1/games/search") {
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=chrono", token),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          atpId: ATP_ID,
          name: "Chrono Trigger",
          year: 1995,
          platforms: ["SNES", "PlayStation"],
          genres: ["RPG"],
          owned: false,
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it("derives paging flags absent from the ATP envelope", async () => {
    stubAtp((path) => {
      if (path === "/api/v1/games/search") {
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 2, limit: 1, total: 3, totalPages: 3 },
        });
      }
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await search(authed("/api/atp/search?q=chrono&page=2&limit=1", token));
    expect(response.status).toBe(200);
    expect((await response.json()).pagination).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it("excludes unstable ATP identities from search cards", async () => {
    const junk = {
      id: "atp-unknown-1789413911077",
      titles: [{ value: "Junk Game", type: "primary" }],
      releases: [],
      developers: [],
      publishers: [],
      genres: [],
      externalIdentifiers: [],
    };
    const admin = { ...junk, id: "admin-123" };
    stubAtp((path) => {
      if (path === "/api/v1/games/search") {
        return jsonResponse({
          data: [junk, ATP_GAME_FIXTURE, admin],
          pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
        });
      }
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=junk", token),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // Only the stable canonical candidate is selectable; unstable
    // identities would preview empty metadata and apply empty patches.
    expect(body.data.map((card: { atpId: string }) => card.atpId)).toEqual([ATP_ID]);
  });

  it("forwards an explicit discover opt-in to ATP search", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.startsWith("http://atp.test")) {
          seen.push(url);
          return jsonResponse({
            data: [ATP_GAME_FIXTURE],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=zelda&discover=true", token),
    );
    expect(response.status).toBe(200);
    expect(seen).toEqual([
      "http://atp.test/api/v1/games/search?q=zelda&page=1&limit=20&discover=true",
    ]);
  });

  it("omits discover on ATP search by default", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.startsWith("http://atp.test")) {
          seen.push(url);
          return jsonResponse({
            data: [ATP_GAME_FIXTURE],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const token = await tokenFor();
    const response = await search(authed("/api/atp/search?q=zelda", token));
    expect(response.status).toBe(200);
    expect(seen).toEqual(["http://atp.test/api/v1/games/search?q=zelda&page=1&limit=20"]);
  });

  it("validates the query with INVALID_QUERY", async () => {
    const token = await tokenFor();
    const response = await search(authed("/api/atp/search", token));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });

  it("routes filtered searches to the deterministic ATP listing", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        seen.push(url);
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }),
    );
    const token = await tokenFor();
    const response = await search(
      authed(
        "/api/atp/search?q=chrono&platform=SNES&genre=RPG&year=1995",
        token,
      ),
    );
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    const called = new URL(seen[0]);
    expect(called.pathname).toBe("/api/v1/games");
    expect(called.searchParams.get("search")).toBe("chrono");
    expect(called.searchParams.get("platform")).toBe("SNES");
    expect(called.searchParams.get("genre")).toBe("RPG");
    expect(called.searchParams.get("releaseYear")).toBe("1995");
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ atpId: ATP_ID, name: "Chrono Trigger" });
  });

  it("rejects an out-of-range year with INVALID_QUERY", async () => {
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=chrono&year=1800", token),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });

  it("strips non-allowlisted params instead of forwarding them", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        seen.push(String(input));
        return jsonResponse({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        });
      }),
    );
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=chrono&classification=GAME&admin=true", token),
    );
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    const called = new URL(seen[0]);
    expect(called.pathname).toBe("/api/v1/games/search");
    expect(called.searchParams.has("classification")).toBe(false);
    expect(called.searchParams.has("admin")).toBe(false);
  });

  it("returns empty results for filtered searches with no match", async () => {
    stubAtp(() =>
      jsonResponse({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
    );
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=chrono&platform=Atari", token),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it("normalizes ATP failures on the filtered listing", async () => {
    stubAtp(() => jsonResponse({ error: { code: "BOOM" } }, 500));
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?q=chrono&genre=RPG", token),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ATP_UNAVAILABLE");
  });

  it("browses by platform without text through the listing", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        seen.push(String(input));
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }),
    );
    const token = await tokenFor();
    const response = await search(
      authed("/api/atp/search?platform=SNES", token),
    );
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    const called = new URL(seen[0]);
    expect(called.pathname).toBe("/api/v1/games");
    expect(called.searchParams.has("search")).toBe(false);
    expect(called.searchParams.get("platform")).toBe("SNES");
  });

  it("rejects empty text without filters", async () => {
    const token = await tokenFor();
    const response = await search(authed("/api/atp/search?q=++", token));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });

  it("forwards developer and publisher to the correct ATP dimensions", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        seen.push(String(input));
        return jsonResponse({
          data: [ATP_GAME_FIXTURE],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }),
    );
    const token = await tokenFor();
    const dev = await search(
      authed("/api/atp/search?developer=Nintendo", token),
    );
    expect(dev.status).toBe(200);
    const devUrl = new URL(seen[0]);
    expect(devUrl.pathname).toBe("/api/v1/games");
    expect(devUrl.searchParams.get("developer")).toBe("Nintendo");
    expect(devUrl.searchParams.has("publisher")).toBe(false);

    const pub = await search(
      authed("/api/atp/search?publisher=Nintendo", token),
    );
    expect(pub.status).toBe(200);
    const pubUrl = new URL(seen[1]);
    expect(pubUrl.searchParams.get("publisher")).toBe("Nintendo");
    expect(pubUrl.searchParams.has("developer")).toBe(false);
  });
});

describe("GET /api/atp/games/:id", () => {
  const params = { params: Promise.resolve({ id: ATP_ID }) };

  it("returns the detail contract with cover", async () => {
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
      if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      atpId: ATP_ID,
      name: "Chrono Trigger",
      year: 1995,
      coverUrl: "https://img.example/c.jpg",
    });
    expect(body.data).not.toHaveProperty("evidence");
  });

  it("exposes full release dates alongside the year", async () => {
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
      if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.releases[0]).toMatchObject({
      platform: "SNES",
      year: 1995,
      month: 3,
      day: 11,
      precision: "day",
    });
    expect(body.data.releases[1]).toMatchObject({
      platform: "PlayStation",
      year: 1999,
      month: null,
      day: null,
    });
  });

  it("passes ATP description through as preview summary", async () => {
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) {
        return jsonResponse({
          data: { ...ATP_GAME_FIXTURE, description: "A time-traveling RPG." },
          origin: "database",
        });
      }
      if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.summary).toBe("A time-traveling RPG.");
  });

  it("returns a null preview summary when ATP has no description", async () => {
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
      if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.summary).toBeNull();
  });

  it("maps unknown ATP ids to ATP_GAME_NOT_FOUND", async () => {
    stubAtp(() => jsonResponse({ error: { code: "NOT_FOUND" } }, 404));
    const token = await tokenFor();
    const response = await detail(
      authed("/api/atp/games/atp-nope-1", token),
      { params: Promise.resolve({ id: "atp-nope-1" }) },
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ATP_GAME_NOT_FOUND");
  });

  it("rejects unstable ATP identities before any ATP access", async () => {
    const atpFetch = vi.fn(async () => {
      throw new Error("ATP must not be contacted for unstable identities");
    });
    vi.stubGlobal("fetch", atpFetch);
    const token = await tokenFor();
    const response = await detail(
      authed("/api/atp/games/atp-unknown-1789413911077", token),
      { params: Promise.resolve({ id: "atp-unknown-1789413911077" }) },
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("UNSTABLE_ATP_IDENTITY");
    expect(atpFetch).not.toHaveBeenCalled();
  });

  it("reports no manual duplicate when names do not match", async () => {
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
      if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.manualDuplicate).toBeNull();
  });

  it("warns on an exact case-insensitive manual name match without merging", async () => {
    await GlobalGame.create({
      slug: "chrono-trigger-manual",
      name: "chrono trigger",
      source: "manual",
    });
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
      if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await detail(authed(`/api/atp/games/${ATP_ID}`, token), params);
    expect(response.status).toBe(200);
    // Warning only: the stored manual name is surfaced, nothing is merged.
    expect((await response.json()).data.manualDuplicate).toEqual({
      name: "chrono trigger",
    });
    expect(await GlobalGame.countDocuments()).toBe(1);
  });
});

describe("GET /api/atp/games/:id/cover", () => {
  const params = { params: Promise.resolve({ id: ATP_ID }) };

  it("returns the cover metadata", async () => {
    stubAtp((path) =>
      path === `/api/v1/games/${ATP_ID}/cover`
        ? jsonResponse(atpCoverPayload())
        : jsonResponse({ error: { code: "NOT_FOUND" } }, 404),
    );
    const token = await tokenFor();
    const response = await cover(authed(`/api/atp/games/${ATP_ID}/cover`, token), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.coverUrl).toBe("https://img.example/c.jpg");
  });

  it("degrades missing covers to null", async () => {
    stubAtp(() => jsonResponse(atpCoverPayload(null)));
    const token = await tokenFor();
    const response = await cover(authed(`/api/atp/games/${ATP_ID}/cover`, token), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.coverUrl).toBeNull();
  });

  it("degrades ATP failures to null instead of failing", async () => {
    stubAtp(() => jsonResponse({ error: { code: "SOURCE_ERROR" } }, 502));
    const token = await tokenFor();
    const response = await cover(authed(`/api/atp/games/${ATP_ID}/cover`, token), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.coverUrl).toBeNull();
  });
});

describe("GET /api/atp/covers/search", () => {
  function atpCoverSearchPayload() {
    return {
      data: {
        query: "chrono",
        type: "cover",
        limit: 6,
        selected: null,
        candidates: [
          { url: "https://img.example/c1.jpg", source: "steam", width: 300, height: 400 },
          { url: "https://img.example/c2.jpg", source: "wikipedia" },
        ],
        errors: [],
      },
      origin: "scraper",
    };
  }

  it("requires authentication", async () => {
    const response = await coversSearch(
      new NextRequest("http://localhost/api/atp/covers/search?q=x"),
    );
    expect(response.status).toBe(401);
  });

  it("returns flattened cover candidates", async () => {
    stubAtp((path) => {
      if (path === "/api/v1/covers/search") return jsonResponse(atpCoverSearchPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await coversSearch(
      authed("/api/atp/covers/search?q=chrono", token),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        { url: "https://img.example/c1.jpg", source: "steam", width: 300, height: 400 },
        { url: "https://img.example/c2.jpg", source: "wikipedia", width: null, height: null },
      ],
    });
  });

  it("returns an empty list when ATP finds no covers", async () => {
    stubAtp((path) => {
      if (path === "/api/v1/covers/search") {
        return jsonResponse({
          data: { query: "zzz", candidates: [], errors: [] },
          origin: "scraper",
        });
      }
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
    const token = await tokenFor();
    const response = await coversSearch(
      authed("/api/atp/covers/search?q=zzz-no-cover", token),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });

  it("validates the query with INVALID_QUERY", async () => {
    const token = await tokenFor();
    const response = await coversSearch(authed("/api/atp/covers/search", token));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });

  it("maps ATP failures to ATP_UNAVAILABLE without leaking", async () => {
    stubAtp(() => jsonResponse({ error: { code: "SOURCE_ERROR" } }, 502));
    const token = await tokenFor();
    const response = await coversSearch(
      authed("/api/atp/covers/search?q=chrono", token),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ATP_UNAVAILABLE");
  });
});

describe("POST /api/atp/import", () => {
  function stubFullCatalog() {
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
      if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
      return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
    });
  }

  it("requires authentication", async () => {
    const response = await importGame(
      postRequest("/api/atp/import", { atpId: ATP_ID }),
    );
    expect(response.status).toBe(401);
  });

  it("imports a snapshot and returns the user-game shape", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const response = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID, personal: { status: "playing", hoursPlayed: 5 } },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.status).toBe("playing");
    expect(body.data.hoursPlayed).toBe(5);
    expect(body.data.game).toMatchObject({
      name: "Chrono Trigger",
      source: "atp",
      atpDomainId: ATP_ID,
      cover: "https://img.example/c.jpg",
    });

    const stored = await GlobalGame.findOne({ atpDomainId: ATP_ID }).lean();
    expect(stored?.source).toBe("atp");
  });

  it("rejects duplicate imports with GAME_ALREADY_IN_LIBRARY", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const payload = {
      method: "POST",
      body: { atpId: ATP_ID },
    } as const;
    expect(
      (await importGame(authed("/api/atp/import", token, payload))).status,
    ).toBe(201);
    const duplicate = await importGame(authed("/api/atp/import", token, payload));
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error.code).toBe("GAME_ALREADY_IN_LIBRARY");
    expect(await GlobalGame.countDocuments({ atpDomainId: ATP_ID })).toBe(1);
  });

  it("maps unknown ATP ids to ATP_GAME_NOT_FOUND", async () => {
    stubAtp(() => jsonResponse({ error: { code: "NOT_FOUND" } }, 404));
    const token = await tokenFor();
    const response = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: "atp-nope-1" },
      }),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ATP_GAME_NOT_FOUND");
  });

  it("handles concurrent duplicate imports deterministically", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const payload = { method: "POST", body: { atpId: ATP_ID } } as const;
    const [first, second] = await Promise.all([
      importGame(authed("/api/atp/import", token, payload)),
      importGame(authed("/api/atp/import", token, payload)),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    expect(await GlobalGame.countDocuments({ atpDomainId: ATP_ID })).toBe(1);
    expect(await UserGame.countDocuments()).toBe(1);
  });

  it("reuses an existing snapshot without duplicating GlobalGame", async () => {
    await GlobalGame.create({
      slug: "preexisting",
      name: "Preexisting",
      source: "atp",
      atpDomainId: ATP_ID,
    });
    // ATP fetch must not even be reached for the snapshot, but stub anyway.
    stubFullCatalog();
    const token = await tokenFor();
    const response = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID },
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data.game.name).toBe("Preexisting");
    expect(await GlobalGame.countDocuments({ atpDomainId: ATP_ID })).toBe(1);
  });

  it("rejects atp-unknown-* identities without touching ATP or the database", async () => {
    stubAtp(() => jsonResponse({ error: { code: "NOT_FOUND" } }, 404));
    const token = await tokenFor();
    const response = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: "atp-unknown-1757777777777" },
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("UNSTABLE_ATP_IDENTITY");
    expect(await GlobalGame.countDocuments()).toBe(0);
    expect(vi.mocked(fetch).mock.calls.length).toBe(0);
  });

  it("rejects admin-* identities without touching ATP or the database", async () => {
    stubAtp(() => jsonResponse({ error: { code: "NOT_FOUND" } }, 404));
    const token = await tokenFor();
    const response = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: "admin-1757777777777-abc123" },
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("UNSTABLE_ATP_IDENTITY");
    expect(await GlobalGame.countDocuments()).toBe(0);
    expect(vi.mocked(fetch).mock.calls.length).toBe(0);
  });

  it("allows a manual game and an ATP import of the same name to coexist", async () => {
    await GlobalGame.create({
      slug: "chrono-trigger-manual",
      name: "Chrono Trigger",
      source: "manual",
    });
    stubFullCatalog();
    const token = await tokenFor();
    const response = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID },
      }),
    );
    // No merge: a second, atp-sourced GlobalGame is created alongside.
    expect(response.status).toBe(201);
    expect(await GlobalGame.countDocuments({ name: "Chrono Trigger" })).toBe(2);
    expect(
      await GlobalGame.countDocuments({ name: "Chrono Trigger", source: "atp" }),
    ).toBe(1);
  });

  it("sends no credentials or user state to ATP during import", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        seen.push({ url: String(input), init });
        const path = new URL(String(input)).pathname;
        if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
        if (path === `/api/v1/games/${ATP_ID}/cover`) {
          return jsonResponse(atpCoverPayload());
        }
        return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      }),
    );
    const token = await tokenFor();
    const response = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID, personal: { status: "playing" } },
      }),
    );
    expect(response.status).toBe(201);
    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get("cookie")).toBeNull();
      expect(headers.get("authorization")).toBeNull();
      expect(call.url).not.toContain("userId");
    }
    const stored = await GlobalGame.findOne({ atpDomainId: ATP_ID }).lean();
    expect(stored).not.toHaveProperty("userId");
  });

  it("serves library reads without contacting ATP", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const imported = await importGame(
      authed("/api/atp/import", token, {
        method: "POST",
        body: { atpId: ATP_ID },
      }),
    );
    expect(imported.status).toBe(201);
    // Snapshot reads must not depend on ATP: restore the real fetch (which
    // cannot reach the stub host) and read the library.
    vi.unstubAllGlobals();
    const response = await listGames(authed("/api/games", token));
    expect(response.status).toBe(200);
  });
});
