import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as statsRoute } from "@/app/api/games/stats/route";
import { signToken } from "@/server/auth/session";
import { getGameStats, getPersonalStatistics } from "@/server/stats/service";
import { UserGame } from "@/db/models/user-game";
import { Types } from "mongoose";
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
  it("builds personal statistics with exact ratings, all statuses and orphaned records", async () => {
    await UserGame.updateOne({ _id: seed.userGameZeldaA }, { $set: { rating: 0, status: "finished", timesFinished: 0 } });
    await UserGame.updateOne({ _id: seed.userGameMarioA }, { $set: { rating: 8.25, status: "playing", hoursPlayed: 12, timesFinished: 3 } });
    await UserGame.create({
      userId: new Types.ObjectId(seed.userAId),
      gameId: new Types.ObjectId(),
      status: "backlog",
      rating: 8.25,
      hoursPlayed: 50,
      timesFinished: 4,
    });

    const stats = await getPersonalStatistics(seed.userAId);
    expect(stats.totalGames).toBe(3);
    expect(stats.byStatus).toMatchObject({ finished: 1, playing: 1, backlog: 1 });
    expect(stats.ratedGames).toBe(3);
    expect(stats.unratedGames).toBe(0);
    expect(stats.byRating).toEqual({ "0": 1, "8.25": 2 });
    expect(stats.averageRating).toBeCloseTo(5.5);
    expect(stats.totalHours).toBe(102);
    expect(stats.gamesWithHours).toBe(3);
    expect(stats.totalTimesFinished).toBe(7);
    expect(stats.gamesWithTimesFinished).toBe(2);
    expect(stats.finishedGames).toBe(1);
    expect(stats.finishedRated).toBe(1);
    expect(stats.finishedWithoutCompletion).toBe(1);
    expect(stats.favoriteGames).toBe(0);
    expect(stats.favoriteUnrated).toBe(0);
    expect(stats.topHours[0]).toEqual({ name: "Jogo indisponível", value: 50 });
    expect(stats.topFinished[0]).toEqual({ name: "Jogo indisponível", value: 4 });
    expect((await getPersonalStatistics(seed.userBId)).totalGames).toBe(1);
  });

  it("counts favorites and finished/rating intersections independently of status", async () => {
    await UserGame.updateOne(
      { _id: seed.userGameZeldaA },
      { $set: { favorite: true, rating: 9, status: "finished", timesFinished: 2 } },
    );
    await UserGame.updateOne(
      { _id: seed.userGameMarioA },
      { $set: { favorite: true, status: "playing", timesFinished: 0 }, $unset: { rating: 1 } },
    );
    await UserGame.create({
      userId: new Types.ObjectId(seed.userAId),
      gameId: new Types.ObjectId(),
      status: "finished",
      rating: 7,
      favorite: true,
      timesFinished: 0,
      hoursPlayed: 0,
    });

    const stats = await getPersonalStatistics(seed.userAId);
    expect(stats.totalGames).toBe(3);
    expect(stats.favoriteGames).toBe(3);
    expect(stats.favoriteUnrated).toBe(1);
    // Zelda (finished, counter 2) + the new game (finished, counter 0).
    expect(stats.finishedGames).toBe(2);
    expect(stats.finishedRated).toBe(2);
    expect(stats.finishedWithoutCompletion).toBe(1);
    // Mario is "playing" but has no completions; the orphan does.
    expect(stats.totalTimesFinished).toBe(2);
    expect(stats.gamesWithTimesFinished).toBe(1);
    // Favorites from the other user are never included.
    expect(stats.favoriteGames).not.toBe(4);
  });

  it("returns zeroed personal statistics for an empty library", async () => {
    await UserGame.deleteMany({ userId: seed.userBId });
    const empty = await getPersonalStatistics(seed.userBId);
    expect(empty).toMatchObject({
      totalGames: 0,
      ratedGames: 0,
      unratedGames: 0,
      averageRating: null,
      totalHours: 0,
      gamesWithHours: 0,
      totalTimesFinished: 0,
      gamesWithTimesFinished: 0,
      favoriteGames: 0,
      favoriteUnrated: 0,
      finishedGames: 0,
      finishedRated: 0,
      finishedWithoutCompletion: 0,
      topHours: [],
      topFinished: [],
    });
    expect(empty.byRating).toEqual({});
    expect(Object.values(empty.byStatus)).toHaveLength(10);
    expect(Object.values(empty.byStatus).every((count) => count === 0)).toBe(true);
  });
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
