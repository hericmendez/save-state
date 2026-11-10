/**
 * "Editar jogo e adicionar" — IGDB import with full personal payload,
 * restrictive conflict policy, and legacy compatibility.
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
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as neutralImport } from "@/app/api/search/import/route";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { __resetServerEnvCache } from "@/lib/env";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import { __resetIgdbFilterCaches } from "@/server/search/igdb-provider";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

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

function stubIgdbFetch(): void {
  process.env.SEARCH_METHOD = "IGDB";
  process.env.TWITCH_CLIENT_ID = "cid";
  process.env.TWITCH_CLIENT_SECRET = "secret";
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 });
      }
      if (url.endsWith("/games")) return jsonResponse([IGDB_GAME]);
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
  process.env.SEARCH_METHOD = "IGDB";
  process.env.TWITCH_CLIENT_ID = "cid";
  process.env.TWITCH_CLIENT_SECRET = "secret";
});
afterEach(() => {
  vi.unstubAllGlobals();
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  delete process.env.SEARCH_METHOD;
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

function importBody(body: unknown, token: string): NextRequest {
  return authedRequest("/api/search/import", token, {
    method: "POST",
    body,
  });
}

const FULL_PERSONAL = {
  status: "playing",
  hoursPlayed: 12,
  timesFinished: 1,
  rating: 9,
  review: { content: "Obra-prima." },
  favorite: true,
  fullyCompleted: false,
  achievements: true,
  achievementProgress: 80,
};

describe("IGDB import personal persistence", () => {
  it("preserves legacy defaults without personal", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await neutralImport(
      importBody({ externalId: "1234" }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.game.source).toBe("igdb");
    expect(body.data.game.igdbId).toBe(1234);
    const userGame = await UserGame.findOne({
      gameId: body.data.game._id,
    }).lean();
    expect(userGame).toMatchObject({
      status: "backlog",
      hoursPlayed: 0,
      timesFinished: 0,
      finished: false,
      favorite: false,
      achievements: false,
    });
    expect(userGame?.rating).toBeUndefined();
    expect(userGame && "review" in userGame).toBe(false);
  });

  it("persists all nine personal fields with derived values", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await neutralImport(
      importBody({ externalId: "1234", personal: FULL_PERSONAL }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const userGame = await UserGame.findOne({
      gameId: body.data.game._id,
    }).lean();
    expect(userGame).toMatchObject({
      status: "playing",
      hoursPlayed: 12,
      timesFinished: 1,
      finished: true,
      rating: 9,
      reviewExcerpt: expect.stringContaining("Obra-prima"),
      favorite: true,
      fullyCompleted: false,
      achievements: true,
      achievementProgress: 80,
      achievementsCompleted: false,
    });
    expect(userGame && "review" in userGame).toBe(false);
    const { GameReview: ImportGameReview } = await import(
      "@/db/models/game-review"
    );
    const stored = await ImportGameReview.findOne({
      userGameId: userGame?._id,
    }).lean();
    expect(stored?.content).toBe("Obra-prima.");
  });

  it("persists a structured Markdown review with excerpt in one request (Phase 3)", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const { GameReview } = await import("@/db/models/game-review");
    const response = await neutralImport(
      importBody(
        {
          externalId: "1234",
          personal: {
            status: "playing",
            review: { content: "# Jogão\n\nMuito **bom**." },
          },
        },
        token,
      ),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const userGame = await UserGame.findOne({
      gameId: body.data.game._id,
    }).lean();
    expect(userGame && "review" in userGame).toBe(false);
    expect(userGame?.reviewExcerpt).toContain("Jogão");
    const review = await GameReview.findOne({
      userGameId: userGame?._id,
    }).lean();
    expect(review?.content).toBe("# Jogão\n\nMuito **bom**.");
  });

  it("derives achievementsCompleted at 100%", async () => {    const token = await tokenFor();
    stubIgdbFetch();
    const response = await neutralImport(
      importBody(
        {
          externalId: "1234",
          personal: { achievements: true, achievementProgress: 100 },
        },
        token,
      ),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    const userGame = await UserGame.findOne({
      gameId: body.data.game._id,
    }).lean();
    expect(userGame?.achievementsCompleted).toBe(true);
  });

  it("rejects achievementProgress without achievements", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const response = await neutralImport(
      importBody(
        {
          externalId: "1234",
          personal: { achievements: false, achievementProgress: 50 },
        },
        token,
      ),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(0);
  });
});

describe("restrictive conflict policy", () => {
  it("legacy import still reuses snapshots", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const first = await neutralImport(
      importBody({ externalId: "1234" }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(first.status).toBe(201);
    const firstId = (await first.json()).data.game._id;
    await UserGame.deleteMany({});
    const second = await neutralImport(
      importBody({ externalId: "1234" }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(second.status).toBe(201);
    expect((await second.json()).data.game._id).toBe(firstId);
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
  });

  it("rejects an existing snapshot without touching anything", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const seed = await neutralImport(
      importBody({ externalId: "1234" }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(seed.status).toBe(201);
    await UserGame.deleteMany({});
    const response = await neutralImport(
      importBody(
        {
          externalId: "1234",
          personal: FULL_PERSONAL,
          conflictPolicy: "reject-existing",
        },
        token,
      ),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("GAME_ALREADY_CATALOGED");
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
    expect(await UserGame.countDocuments({})).toBe(0);
  });

  it("prefers ALREADY_IN_LIBRARY when the game is owned", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const seed = await neutralImport(
      importBody({ externalId: "1234" }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(seed.status).toBe(201);
    for (const body of [
      { externalId: "1234" },
      {
        externalId: "1234",
        personal: FULL_PERSONAL,
        conflictPolicy: "reject-existing",
      },
    ]) {
      const response = await neutralImport(
        importBody(body, token),
        // @ts-expect-error Next 15 route context unused here
        {},
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(
        "GAME_ALREADY_IN_LIBRARY",
      );
    }
  });

  it("maps cross-origin identity to GAME_CATALOG_CONFLICT", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    await GlobalGame.create({
      slug: `chrono-manual-${Date.now()}`,
      name: "Chrono Trigger",
      source: "manual",
      igdbId: 1234,
    });
    for (const body of [
      { externalId: "1234" },
      { externalId: "1234", conflictPolicy: "reject-existing" },
    ]) {
      const response = await neutralImport(
        importBody(body, token),
        // @ts-expect-error Next 15 route context unused here
        {},
      );
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("GAME_CATALOG_CONFLICT");
    }
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
  });

  it("concurrent restrictive imports create a single snapshot", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const payload = {
      externalId: "1234",
      personal: FULL_PERSONAL,
      conflictPolicy: "reject-existing",
    };
    const [first, second] = await Promise.all([
      neutralImport(
        importBody(payload, token),
        // @ts-expect-error Next 15 route context unused here
        {},
      ),
      neutralImport(
        importBody(payload, token),
        // @ts-expect-error Next 15 route context unused here
        {},
      ),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect((await conflict.json()).error.code).toBe("GAME_ALREADY_CATALOGED");
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
    expect(await UserGame.countDocuments({})).toBe(1);
  });

  it("retry after snapshot without UserGame reuses legacy but rejects restrictive", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const seed = await neutralImport(
      importBody({ externalId: "1234" }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(seed.status).toBe(201);
    const snapshotId = (await seed.json()).data.game._id;
    await UserGame.deleteMany({});
    const legacy = await neutralImport(
      importBody({ externalId: "1234", personal: FULL_PERSONAL }, token),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(legacy.status).toBe(201);
    expect((await legacy.json()).data.game._id).toBe(snapshotId);
    await UserGame.deleteMany({});
    const strict = await neutralImport(
      importBody(
        {
          externalId: "1234",
          personal: FULL_PERSONAL,
          conflictPolicy: "reject-existing",
        },
        token,
      ),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(strict.status).toBe(409);
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
  });
});
