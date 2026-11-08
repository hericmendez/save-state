/**
 * Home highlights service — single-aggregation candidates.
 *
 * Covers winners per kind, deterministic tie-breaks, missing data
 * (nulls, never fabricated), and per-user isolation through the real
 * in-memory MongoDB.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import {
  incrementTimesFinished,
  updateGame,
} from "@/server/games/service";
import { getHighlightData } from "@/server/home/service";
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

describe("getHighlightData service", () => {
  it("resolves every game kind from the caller's library", async () => {
    const data = await getHighlightData(seed.userAId);
    expect(data.mostHours?.game.name).toBe("Zelda: Ocarina of Time");
    expect(data.mostHours?.hoursPlayed).toBe(40);
    expect(data.topRated?.game.name).toBe("Zelda: Ocarina of Time");
    expect(data.topRated?.rating).toBe(9);
    expect(data.mostFinished?.game.name).toBe("Zelda: Ocarina of Time");
    expect(data.mostFinished?.timesFinished).toBe(2);
  });

  it("aggregates platform and genre by games first, hours second", async () => {
    const data = await getHighlightData(seed.userAId);
    expect(data.topPlatform).toEqual({ name: "N64", games: 2, hours: 50 });
    // RPG/Adventure/Platformer tie at 1 game each; RPG and Adventure tie
    // at 40h, so the name decides deterministically: Adventure wins.
    expect(data.topGenre).toEqual({ name: "Adventure", games: 1, hours: 40 });
  });

  it("breaks game ties deterministically by _id", async () => {
    await UserGame.updateOne(
      { _id: seed.userGameMarioA },
      { hoursPlayed: 40, timesFinished: 2, rating: 9 },
    );
    const data = await getHighlightData(seed.userAId);
    // Zelda's UserGame was created first, so its _id is smaller.
    expect(String(data.mostHours?._id)).toBe(seed.userGameZeldaA);
    expect(String(data.topRated?._id)).toBe(seed.userGameZeldaA);
    expect(String(data.mostFinished?._id)).toBe(seed.userGameZeldaA);
  });

  it("returns nulls instead of values when data is missing", async () => {
    // User B owns only Tetris: 0h, no rating, never finished, no favorite.
    const data = await getHighlightData(seed.userBId);
    expect(data.mostHours).toBeNull();
    expect(data.topRated).toBeNull();
    expect(data.mostFinished).toBeNull();
    expect(data.randomFavorite).toBeNull();
    expect(data.topPlatform).toEqual({ name: "Game Boy", games: 1, hours: 0 });
    expect(data.topGenre).toEqual({ name: "Puzzle", games: 1, hours: 0 });
  });

  it("draws the random favorite from the caller's favorites only", async () => {
    expect((await getHighlightData(seed.userAId)).randomFavorite).toBeNull();
    await UserGame.updateOne(
      { _id: seed.userGameMarioA },
      { favorite: true },
    );
    const data = await getHighlightData(seed.userAId);
    expect(data.randomFavorite?.game.name).toBe("Super Mario 64");
    expect(String(data.randomFavorite?._id)).toBe(seed.userGameMarioA);
    // The other user's data never leaks into the draw.
    expect((await getHighlightData(seed.userBId)).randomFavorite).toBeNull();
  });

  it("never leaks another user's library", async () => {
    const data = await getHighlightData(seed.userBId);
    expect(data.mostHours?.game.name).not.toBe("Zelda: Ocarina of Time");
    expect(data.topPlatform?.name).toBe("Game Boy");
  });

  it("resolves the most recently added game by creation date", async () => {
    // Mongoose guards createdAt on model updates, so the dates are set
    // through the collection API (production code never rewrites them).
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameZeldaA) },
      { $set: { createdAt: new Date("2024-01-01T00:00:00Z") } },
    );
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $set: { createdAt: new Date("2024-01-02T00:00:00Z") } },
    );
    const data = await getHighlightData(seed.userAId);
    expect(String(data.recentlyAdded?._id)).toBe(seed.userGameMarioA);
    expect(data.recentlyAdded?.createdAt).toEqual(
      new Date("2024-01-02T00:00:00Z"),
    );
    // User B's most recent addition is its only game.
    const other = await getHighlightData(seed.userBId);
    expect(String(other.recentlyAdded?._id)).toBe(seed.userGameTetrisB);
  });

  it("ignores updatedAt when resolving the most recent addition", async () => {
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameZeldaA) },
      {
        $set: {
          hoursPlayed: 41,
          createdAt: new Date("2024-01-01T00:00:00Z"),
        },
      },
    );
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $set: { createdAt: new Date("2024-01-02T00:00:00Z") } },
    );
    // Touching Zelda bumps its updatedAt past Mario's, yet Mario was
    // included later — createdAt decides, never updatedAt.
    const data = await getHighlightData(seed.userAId);
    expect(String(data.recentlyAdded?._id)).toBe(seed.userGameMarioA);
  });

  it("breaks addition-date ties deterministically", async () => {
    const sameDate = new Date("2024-05-05T00:00:00Z");
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameZeldaA) },
      { $set: { createdAt: sameDate } },
    );
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $set: { createdAt: sameDate } },
    );
    const data = await getHighlightData(seed.userAId);
    // Same millisecond: the larger _id (newer ObjectId) wins.
    const expected = [seed.userGameZeldaA, seed.userGameMarioA].sort()[1];
    expect(String(data.recentlyAdded?._id)).toBe(expected);
  });

  it("returns no wishlist or bucha candidates when the data is absent", async () => {
    const data = await getHighlightData(seed.userAId);
    // Seed ratings are 9 and 8: nothing strictly below 5.
    expect(data.wishlistSpot).toBeNull();
    expect(data.buchaPool).toEqual([]);
    // Unrated games are never treated as zero.
    const other = await getHighlightData(seed.userBId);
    expect(other.wishlistSpot).toBeNull();
    expect(other.buchaPool).toEqual([]);
  });

  it("draws the wishlist game from wishlist status only", async () => {
    await UserGame.updateOne(
      { _id: seed.userGameMarioA },
      { status: "wishlist" },
    );
    const data = await getHighlightData(seed.userAId);
    expect(data.wishlistSpot?.game.name).toBe("Super Mario 64");
    expect(String(data.wishlistSpot?._id)).toBe(seed.userGameMarioA);
    expect((await getHighlightData(seed.userBId)).wishlistSpot).toBeNull();
  });

  it("pools every game tied at the lowest rating below 5", async () => {
    await UserGame.updateOne(
      { _id: seed.userGameZeldaA },
      { rating: 9 },
    );
    await UserGame.updateOne(
      { _id: seed.userGameMarioA },
      { rating: 2 },
    );
    const single = await getHighlightData(seed.userAId);
    expect(single.buchaPool).toHaveLength(1);
    expect(single.buchaPool[0]?.game.name).toBe("Super Mario 64");

    await UserGame.updateOne(
      { _id: seed.userGameZeldaA },
      { rating: 2 },
    );
    const tied = await getHighlightData(seed.userAId);
    expect(
      tied.buchaPool.map((entry) => entry.game.name).sort(),
    ).toEqual(["Super Mario 64", "Zelda: Ocarina of Time"]);
  });

  it("resolves the most recent completion from recorded dates", async () => {
    // Seed fixtures are written through the models directly, so no
    // completion dates exist yet: the highlight is unavailable, never
    // approximated from updatedAt.
    expect((await getHighlightData(seed.userAId)).recentFinish).toBeNull();

    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    await incrementTimesFinished(seed.userAId, seed.userGameZeldaA);
    const data = await getHighlightData(seed.userAId);
    expect(String(data.recentFinish?.userGame._id)).toBe(
      seed.userGameZeldaA,
    );
    expect(data.recentFinish?.finishedAt).toBeInstanceOf(Date);
    // The other user's finish history is untouched.
    expect((await getHighlightData(seed.userBId)).recentFinish).toBeNull();
  });

  it("orders by lastFinishedAt, not by hours or finishes", async () => {
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameZeldaA) },
      { $set: { lastFinishedAt: new Date("2024-01-01T00:00:00Z") } },
    );
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $set: { lastFinishedAt: new Date("2024-02-01T00:00:00Z") } },
    );
    // Zelda leads on hours (40) and finishes (2); Mario still wins the
    // recency highlight through its newer date.
    const data = await getHighlightData(seed.userAId);
    expect(String(data.recentFinish?.userGame._id)).toBe(
      seed.userGameMarioA,
    );
  });

  it("breaks equal dates deterministically and ignores updatedAt", async () => {
    const sameDate = new Date("2024-06-06T00:00:00Z");
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameZeldaA) },
      { $set: { lastFinishedAt: sameDate } },
    );
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $set: { lastFinishedAt: sameDate } },
    );
    // Touching Zelda bumps its updatedAt past Mario's; the tie still
    // breaks by _id asc, never by updatedAt.
    await UserGame.updateOne(
      { _id: seed.userGameZeldaA },
      { hoursPlayed: 41 },
    );
    const data = await getHighlightData(seed.userAId);
    const expected = [seed.userGameZeldaA, seed.userGameMarioA].sort()[0];
    expect(String(data.recentFinish?.userGame._id)).toBe(expected);
  });

  it("ignores manual counter corrections for recency", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameZeldaA);
    await UserGame.updateOne(
      { _id: seed.userGameMarioA },
      { timesFinished: 2, finished: true },
    );
    // Mario's 2→3 is a counter correction, not a proven completion:
    // Zelda keeps the highlight.
    await updateGame(seed.userAId, seed.userGameMarioA, { timesFinished: 3 });
    const data = await getHighlightData(seed.userAId);
    expect(String(data.recentFinish?.userGame._id)).toBe(
      seed.userGameZeldaA,
    );
  });

  it("ignores legacy records without the date field", async () => {
    const legacy = await GlobalGame.create({
      slug: "legacy-quest",
      name: "Legacy Quest",
      source: "manual",
    });
    // Raw insert without lastFinishedAt: finished several times, yet it
    // must never win recency — while still counting for totals.
    await UserGame.collection.insertOne({
      userId: new Types.ObjectId(seed.userAId),
      gameId: legacy._id,
      status: "finished",
      hoursPlayed: 1,
      timesFinished: 9,
      finished: true,
      favorite: false,
      fullyCompleted: false,
      achievements: false,
      achievementsCompleted: false,
      createdAt: new Date("2020-01-01T00:00:00Z"),
      updatedAt: new Date("2020-01-01T00:00:00Z"),
    });
    const data = await getHighlightData(seed.userAId);
    expect(data.recentFinish).toBeNull();
    expect(data.mostFinished?.game.name).toBe("Legacy Quest");
  });

  it("skips dates whose game no longer exists", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    await UserGame.deleteOne({ _id: seed.userGameMarioA });
    // Zelda was finished in the seed data but through a direct model
    // write (no recorded date), so nothing valid remains.
    expect((await getHighlightData(seed.userAId)).recentFinish).toBeNull();
  });
});
