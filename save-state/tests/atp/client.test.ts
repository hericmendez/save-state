import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertValidAtpId,
  getAtpGame,
  getAtpGameCover,
  searchAtpGames,
} from "@/server/atp/client";
import { mapAtpGameToSnapshot } from "@/server/atp/mapping";
import type { AtpGame } from "@/server/atp/schemas";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/save-state-test";
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.APP_URL ??= "http://test.local";
process.env.ATP_BASE_URL = "http://atp.test";

export const ATP_GAME_FIXTURE = {
  id: "atp-wikipedia-6509467",
  titles: [
    { value: "Chrono Trigger", type: "primary" },
    { value: "Kurono Toriga", type: "alternate" },
  ],
  releases: [
    {
      platform: { name: "SNES" },
      region: { name: "JP" },
      releaseDate: { year: 1995, month: 3, day: 11, precision: "day" },
    },
    { platform: { name: "PlayStation" }, releaseDate: { year: 1999 } },
  ],
  developers: [{ name: "Square" }],
  publishers: [{ name: "Square" }, { name: "Square" }],
  genres: [{ name: "RPG" }],
  externalIdentifiers: [{ source: "wikipedia", id: "6509467" }],
};

function stubFetchOnce(
  impl: (url: string) => Response | Promise<Response>,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => impl(url)),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertValidAtpId", () => {
  it("accepts opaque ATP ids", () => {
    expect(() =>
      assertValidAtpId("atp-wikipedia-6509467"),
    ).not.toThrow();
  });

  it.each(["", "a/b", "a?b", "../x", "a".repeat(129), "sp ace"])(
    "rejects malicious id %j",
    (id) => {
      expect(() => assertValidAtpId(id)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_ERROR" }),
      );
    },
  );
});

describe("searchAtpGames", () => {
  it("builds fixed URLs and returns validated pages", async () => {
    const seen: string[] = [];
    stubFetchOnce((url) => {
      seen.push(url);
      return jsonResponse({
        data: [ATP_GAME_FIXTURE],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });
    const result = await searchAtpGames({ q: "chrono", page: 1, limit: 20 });
    expect(seen).toEqual([
      "http://atp.test/api/v1/games/search?q=chrono&page=1&limit=20",
    ]);
    expect(result.data[0].id).toBe("atp-wikipedia-6509467");
  });

  it("maps ATP 404 on search to an empty result contract error", async () => {
    stubFetchOnce(() => jsonResponse({ error: { code: "NOT_FOUND" } }, 404));
    await expect(
      searchAtpGames({ q: "nothing", page: 1, limit: 20 }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "ATP_GAME_NOT_FOUND" }),
    );
  });

  it("maps ATP 429 to RATE_LIMIT_EXCEEDED", async () => {
    stubFetchOnce(() => jsonResponse({ error: { code: "RATE_LIMIT" } }, 429));
    await expect(
      searchAtpGames({ q: "chrono", page: 1, limit: 20 }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "RATE_LIMIT_EXCEEDED" }),
    );
  });

  it("maps ATP 5xx to ATP_UNAVAILABLE without leaking bodies", async () => {
    stubFetchOnce(() =>
      jsonResponse({ error: { code: "SOURCE_ERROR", detail: "secret" } }, 502),
    );
    try {
      await searchAtpGames({ q: "chrono", page: 1, limit: 20 });
      expect.unreachable();
    } catch (error) {
      const apiError = error as { code: string; message: string };
      expect(apiError.code).toBe("ATP_UNAVAILABLE");
      expect(JSON.stringify(apiError)).not.toContain("secret");
    }
  });

  it("maps malformed DTOs to INTERNAL_ERROR", async () => {
    stubFetchOnce(() => jsonResponse({ data: [{ nope: true }] }));
    await expect(
      searchAtpGames({ q: "chrono", page: 1, limit: 20 }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INTERNAL_ERROR" }),
    );
  });

  it("maps malformed JSON to INTERNAL_ERROR", async () => {
    stubFetchOnce(() => new Response("not-json{", { status: 200 }));
    await expect(
      searchAtpGames({ q: "chrono", page: 1, limit: 20 }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INTERNAL_ERROR" }),
    );
  });

  it("maps connection failure to ATP_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      searchAtpGames({ q: "chrono", page: 1, limit: 20 }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "ATP_UNAVAILABLE" }),
    );
  });
});

describe("getAtpGame", () => {
  it("validates the id before any request", async () => {
    const spy = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", spy);
    await expect(getAtpGame("../evil")).rejects.toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("getAtpGameCover", () => {
  it("returns the selected cover", async () => {
    stubFetchOnce(() =>
      jsonResponse({
        data: {
          gameId: "atp-x",
          selected: { url: "https://img.example/c.jpg", width: 300, height: 400, source: "steam" },
          candidates: [],
        },
      }),
    );
    await expect(getAtpGameCover("atp-x")).resolves.toEqual({
      url: "https://img.example/c.jpg",
      width: 300,
      height: 400,
      source: "steam",
    });
  });

  it("returns null when nothing is selected", async () => {
    stubFetchOnce(() =>
      jsonResponse({ data: { gameId: "atp-x", selected: null, candidates: [] } }),
    );
    await expect(getAtpGameCover("atp-x")).resolves.toBeNull();
  });
});

describe("mapAtpGameToSnapshot", () => {
  it("maps a normal game deterministically", async () => {
    const { mapAtpGameToSnapshot: map } = await import(
      "@/server/atp/mapping"
    );
    expect(
      map(ATP_GAME_FIXTURE as AtpGame, {
        url: "https://img.example/c.jpg",
        width: 1,
        height: 1,
        source: "steam",
      }),
    ).toEqual({
      name: "Chrono Trigger",
      source: "atp",
      atpDomainId: "atp-wikipedia-6509467",
      cover: "https://img.example/c.jpg",
      genres: ["RPG"],
      platforms: ["SNES", "PlayStation"],
      developers: ["Square"],
      publishers: ["Square"],
      releaseDate: new Date(Date.UTC(1995, 0, 1)),
    });
  });

  it("falls back without primary title", async () => {
    const { mapAtpGameToSnapshot: map } = await import(
      "@/server/atp/mapping"
    );
    const snapshot = map(
      { ...ATP_GAME_FIXTURE, titles: [{ value: "Alt", type: "alternate" }] } as AtpGame,
      null,
    );
    expect(snapshot.name).toBe("Alt");
    expect(snapshot.cover).toBeUndefined();
  });

  it("handles missing releases and empty arrays", async () => {
    const { mapAtpGameToSnapshot: map } = await import(
      "@/server/atp/mapping"
    );
    const snapshot = map(
      {
        id: "atp-x",
        titles: [],
        releases: [],
        developers: [],
        publishers: [],
        genres: [],
        externalIdentifiers: [],
      } as AtpGame,
      null,
    );
    expect(snapshot).toMatchObject({
      name: "Unknown game",
      platforms: [],
    });
    expect("releaseDate" in snapshot).toBe(false);
  });
});

describe("mapAtpGameToSnapshot (direct)", () => {
  it("uses cover null without cover key", () => {
    expect(
      mapAtpGameToSnapshot(ATP_GAME_FIXTURE as AtpGame, null).cover,
    ).toBeUndefined();
  });
});
