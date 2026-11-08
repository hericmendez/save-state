import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as statsRoute } from "@/app/api/games/stats/route";
import { signToken } from "@/server/auth/session";
import { getGameStats } from "@/server/stats/service";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { seedReadFixtures, type SeedResult } from "./seed";

let seed: SeedResult;

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  seed = await seedReadFixtures();
});

describe("getGameStats service", () => {
  it("aggregates totals, averages, and distributions for the caller", async () => {
    const stats = await getGameStats(seed.userAId, {});
    expect(stats.totalGames).toBe(2);
    expect(stats.totalHoursPlayed).toBe(50);
    expect(stats.totalTimesFinished).toBe(2);
    expect(stats.averageRating).toBeCloseTo(8.5);
    expect(stats.averageHoursPlayed).toBeCloseTo(25);
    expect(stats.byStatus).toEqual({ playing: 1, finished: 1 });
    expect(stats.byGenre).toMatchObject({ RPG: 1, Platformer: 1 });
    expect(stats.byPlatform).toMatchObject({ N64: 2 });
    expect(stats.byReleaseYear).toMatchObject({ "1998": 1, "1996": 1 });
    expect(stats.byRating).toMatchObject({ "8": 1, "9": 1 });
  });

  it("returns zeroed stats for a user without games", async () => {
    const stats = await getGameStats(seed.userBId, {});
    // User B owns exactly one game; delete it via a fresh check below.
    expect(stats.totalGames).toBe(1);
    const { UserGame } = await import("@/db/models/user-game");
    await UserGame.deleteMany({ userId: seed.userBId });
    const empty = await getGameStats(seed.userBId, {});
    expect(empty).toMatchObject({
      totalGames: 0,
      totalHoursPlayed: 0,
      totalTimesFinished: 0,
      averageRating: null,
      averageHoursPlayed: 0,
      averageTimesFinished: 0,
    });
    expect(empty.byStatus).toEqual({});
  });

  it("respects the same filters as the listing", async () => {
    const stats = await getGameStats(seed.userAId, { search: "mario" });
    expect(stats.totalGames).toBe(1);
    expect(stats.totalHoursPlayed).toBe(10);
  });

  it("never leaks another user's data", async () => {
    const stats = await getGameStats(seed.userBId, {});
    expect(stats.totalGames).toBe(1);
    expect(stats.byGenre).toMatchObject({ Puzzle: 1 });
    expect(stats.byGenre).not.toHaveProperty("RPG");
  });
});

describe("GET /api/games/stats", () => {
  it("requires authentication", async () => {
    const response = await statsRoute(
      new NextRequest("http://localhost/api/games/stats"),
    );
    expect(response.status).toBe(401);
  });

  it("returns { data } with the caller's stats", async () => {
    const token = signToken({ userId: seed.userAId, sessionVersion: 0 });
    const response = await statsRoute(
      new NextRequest("http://localhost/api/games/stats", {
        headers: { cookie: `token=${token}` },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.totalGames).toBe(2);
    expect(body.data.byStatus).toEqual({ playing: 1, finished: 1 });
  });
});
