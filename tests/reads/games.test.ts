import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listGamesRoute } from "@/app/api/games/route";
import { GET as getGameRoute } from "@/app/api/games/[gameId]/route";
import { getGame, listGames } from "@/server/games/service";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { seedReadFixtures, type SeedResult } from "./seed";

let seed: SeedResult;

beforeAll(async () => {
  await startTestDatabase();
});
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  seed = await seedReadFixtures();
});

describe("listGames service", () => {
  it("returns the caller's games with populated metadata, newest first", async () => {
    const result = await listGames(seed.userAId, { page: 1, limit: 20 });
    expect(result.pagination).toMatchObject({ total: 2, totalPages: 1 });
    expect(result.data).toHaveLength(2);
    for (const entry of result.data) {
      expect(entry.game).toBeDefined();
      expect(typeof entry.game.name).toBe("string");
      expect(String(entry.userId)).toBe(seed.userAId);
    }
    // Zelda was saved last (list assignment) → updatedAt desc puts it first.
    expect(result.data[0].game.name).toBe("Zelda: Ocarina of Time");
  });

  it("isolates users: B never sees A's games", async () => {
    const result = await listGames(seed.userBId, { page: 1, limit: 20 });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].game.name).toBe("Tetris");
  });

  it("paginates with the preserved envelope", async () => {
    const first = await listGames(seed.userAId, { page: 1, limit: 1 });
    expect(first.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    const second = await listGames(seed.userAId, { page: 2, limit: 1 });
    expect(second.pagination.hasPreviousPage).toBe(true);
    expect(second.data[0]._id).not.toEqual(first.data[0]._id);
  });

  it("filters by partial case-insensitive search", async () => {
    const result = await listGames(seed.userAId, {
      page: 1,
      limit: 20,
      search: "zelda",
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].game.name).toContain("Zelda");
  });

  it("filters by genre/platform/developer and numeric ranges", async () => {
    const byGenre = await listGames(seed.userAId, {
      page: 1,
      limit: 20,
      genre: "rpg",
    });
    expect(byGenre.pagination.total).toBe(1);

    const byHours = await listGames(seed.userAId, {
      page: 1,
      limit: 20,
      hoursPlayedMin: 20,
    });
    expect(byHours.pagination.total).toBe(1);
    expect(byHours.data[0].game.name).toContain("Zelda");

    const byRating = await listGames(seed.userAId, {
      page: 1,
      limit: 20,
      ratingMin: 9,
    });
    expect(byRating.pagination.total).toBe(1);
  });

  it("filters by release-date range", async () => {
    const result = await listGames(seed.userAId, {
      page: 1,
      limit: 20,
      releaseDateFrom: new Date("1998-01-01T00:00:00Z"),
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].game.name).toContain("Zelda");
  });

  it("filters by list membership", async () => {
    const result = await listGames(seed.userAId, {
      page: 1,
      limit: 20,
      collectionId: seed.collectionFavoritesA,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].game.name).toContain("Zelda");
  });
});

describe("getGame service", () => {
  it("returns the owned entry with populated game", async () => {
    const entry = await getGame(seed.userAId, seed.userGameZeldaA);
    expect(entry.game.name).toContain("Zelda");
    expect(entry.status).toBe("finished");
  });

  it("rejects cross-user access with GAME_NOT_FOUND", async () => {
    await expect(
      getGame(seed.userBId, seed.userGameZeldaA),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("rejects unknown ids with GAME_NOT_FOUND", async () => {
    await expect(
      getGame(seed.userAId, "000000000000000000000000"),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("rejects malformed ids with INVALID_GAME_ID", async () => {
    await expect(getGame(seed.userAId, "nope")).rejects.toMatchObject({
      code: "INVALID_GAME_ID",
    });
  });
});

describe("GET /api/games", () => {
  function listRequest(query = ""): NextRequest {
    return new NextRequest(`http://localhost/api/games${query}`);
  }

  it("requires authentication", async () => {
    const response = await listGamesRoute(listRequest());
    expect(response.status).toBe(401);
  });

  it("rejects invalid query input with INVALID_QUERY", async () => {
    const { signToken } = await import("@/server/auth/session");
    const { User } = await import("@/db/models/user");
    const user = await User.findById(seed.userAId).lean();
    const token = signToken({
      userId: seed.userAId,
      sessionVersion: user?.sessionVersion ?? 0,
    });
    const request = new NextRequest("http://localhost/api/games?page=0", {
      headers: { cookie: `token=${token}` },
    });
    const response = await listGamesRoute(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });
});

describe("GET /api/games/:gameId", () => {
  it("returns { data } for the owned entry", async () => {
    const { signToken } = await import("@/server/auth/session");
    const token = signToken({ userId: seed.userAId, sessionVersion: 0 });
    const request = new NextRequest(
      `http://localhost/api/games/${seed.userGameZeldaA}`,
      { headers: { cookie: `token=${token}` } },
    );
    const response = await getGameRoute(request, {
      params: Promise.resolve({ gameId: seed.userGameZeldaA }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.game.name).toContain("Zelda");
  });

  it("validates the id param with VALIDATION_ERROR", async () => {
    const { signToken } = await import("@/server/auth/session");
    const token = signToken({ userId: seed.userAId, sessionVersion: 0 });
    const request = new NextRequest("http://localhost/api/games/nope", {
      headers: { cookie: `token=${token}` },
    });
    const response = await getGameRoute(request, {
      params: Promise.resolve({ gameId: "nope" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
