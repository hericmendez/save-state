/**
 * lastFinishedAt persistence + backfill.
 *
 * The completion date is owned by UserGame and set only by explicit
 * completion transitions — never from updatedAt/createdAt, never for
 * manual counter edits, never invented at creation. The backfill replays
 * only provable finish events and only moves dates forward.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Types } from "mongoose";
import { Activity } from "@/db/models/activity";
import { UserGame } from "@/db/models/user-game";
import {
  backfillLastFinishedAt,
  collectFinishEventGroups,
  createGame,
  incrementTimesFinished,
  updateGame,
} from "@/server/games/service";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { seedReadFixtures, type SeedResult } from "../reads/seed";

let seed: SeedResult;

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  seed = await seedReadFixtures();
});

async function lastFinishedAtOf(userGameId: string): Promise<Date | null> {
  const doc = await UserGame.findById(userGameId).lean();
  return (doc?.lastFinishedAt as Date | null | undefined) ?? null;
}

describe("completion persistence", () => {
  it("leaves the date null on plain creation", async () => {
    const created = await createGame({
      userId: seed.userAId,
      game: { name: "Celeste" },
    });
    expect(created.lastFinishedAt).toBeNull();
  });

  it("does not invent a date for games created already finished", async () => {
    const created = await createGame({
      userId: seed.userAId,
      game: { name: "Hades" },
      timesFinished: 3,
    });
    expect(created.finished).toBe(true);
    expect(created.timesFinished).toBe(3);
    expect(created.lastFinishedAt).toBeNull();
  });

  it("records the date on an explicit finish (Zerei +1)", async () => {
    const before = new Date();
    const result = await incrementTimesFinished(
      seed.userAId,
      seed.userGameMarioA,
    );
    expect(result.timesFinished).toBe(1);
    expect(result.lastFinishedAt).toBeInstanceOf(Date);
    expect(result.lastFinishedAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });

  it("moves the date forward on a second finish", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $set: { lastFinishedAt: new Date("2020-01-01T00:00:00Z") } },
    );
    const result = await incrementTimesFinished(
      seed.userAId,
      seed.userGameMarioA,
    );
    expect(result.lastFinishedAt!.getTime()).toBeGreaterThan(
      new Date("2020-01-01T00:00:00Z").getTime(),
    );
  });

  it("persists the date even when the Activity record fails", async () => {
    vi.spyOn(Activity, "create").mockRejectedValueOnce(
      new Error("diary down"),
    );
    const result = await incrementTimesFinished(
      seed.userAId,
      seed.userGameMarioA,
    );
    expect(result.timesFinished).toBe(1);
    expect(result.lastFinishedAt).toBeInstanceOf(Date);
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toBeInstanceOf(Date);
  });

  it("ignores edits to other fields", async () => {
    await updateGame(seed.userAId, seed.userGameMarioA, {
      hoursPlayed: 99,
      rating: 7,
    });
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toBeNull();
  });

  it("records the date on an unfinished→finished transition", async () => {
    const result = await updateGame(seed.userAId, seed.userGameMarioA, {
      timesFinished: 1,
    });
    expect(result.finished).toBe(true);
    expect(result.lastFinishedAt).toBeInstanceOf(Date);
  });

  it("keeps the date on manual counter changes while finished", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    const first = (await lastFinishedAtOf(seed.userGameMarioA))!;
    // Manual increase (a counter correction, not a proven completion).
    await updateGame(seed.userAId, seed.userGameMarioA, { timesFinished: 5 });
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toEqual(first);
    // Manual decrease likewise creates no new date.
    await updateGame(seed.userAId, seed.userGameMarioA, { timesFinished: 1 });
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toEqual(first);
  });
});

describe("backfill", () => {
  it("recovers a game.finished event date", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    const [event] = await Activity.find({
      userId: seed.userAId,
      type: "game.finished",
    }).lean();
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $unset: { lastFinishedAt: 1 } },
    );
    const result = await backfillLastFinishedAt();
    expect(result.updated).toBe(1);
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toEqual(
      event.createdAt,
    );
  });

  it("recovers a repeat completion recorded as a changed event", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    await updateGame(seed.userAId, seed.userGameMarioA, { timesFinished: 2 });
    const changed = await Activity.findOne({
      userId: seed.userAId,
      type: "game.times_finished_changed",
    }).lean();
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $unset: { lastFinishedAt: 1 } },
    );
    await backfillLastFinishedAt();
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toEqual(
      changed!.createdAt,
    );
  });

  it("picks the most recent event per game", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameZeldaA);
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    await UserGame.collection.updateMany(
      {},
      { $unset: { lastFinishedAt: 1 } },
    );
    await backfillLastFinishedAt();
    const zelda = (await lastFinishedAtOf(seed.userGameZeldaA))!;
    const mario = (await lastFinishedAtOf(seed.userGameMarioA))!;
    expect(mario.getTime()).toBeGreaterThanOrEqual(zelda.getTime());
  });

  it("leaves records without events at null", async () => {
    // Seed writes bypass the services, so no finish events exist.
    const result = await backfillLastFinishedAt();
    expect(result.eventGroups).toBe(0);
    expect(result.updated).toBe(0);
    expect(await lastFinishedAtOf(seed.userGameZeldaA)).toBeNull();
  });

  it("is idempotent and never regresses dates", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $unset: { lastFinishedAt: 1 } },
    );
    const first = await backfillLastFinishedAt();
    expect(first.updated).toBe(1);
    const second = await backfillLastFinishedAt();
    expect(second.updated).toBe(0);
    expect(second.alreadyCurrent).toBe(1);

    // An older event never overwrites a newer recorded date.
    await Activity.create({
      userId: new Types.ObjectId(seed.userAId),
      type: "game.finished",
      userGameId: new Types.ObjectId(seed.userGameMarioA),
      game: { name: "Super Mario 64" },
      metadata: { timesFinished: 1 },
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    const current = await lastFinishedAtOf(seed.userGameMarioA);
    const third = await backfillLastFinishedAt();
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toEqual(current);
    expect(third.updated).toBe(0);
  });

  it("ignores game.added events", async () => {
    await createGame({ userId: seed.userAId, game: { name: "Celeste" } });
    const groups = await collectFinishEventGroups();
    expect(groups).toEqual([]);
  });

  it("ignores events without a trustworthy association", async () => {
    await Activity.create({
      userId: new Types.ObjectId(seed.userAId),
      type: "game.finished",
      userGameId: new Types.ObjectId(),
      game: { name: "Ghost" },
      metadata: { timesFinished: 1 },
    });
    const result = await backfillLastFinishedAt();
    expect(result.updated).toBe(0);
    expect(result.ignored).toBe(1);
  });

  it("never applies another user's events", async () => {
    await incrementTimesFinished(seed.userAId, seed.userGameMarioA);
    await UserGame.collection.updateOne(
      { _id: new Types.ObjectId(seed.userGameMarioA) },
      { $unset: { lastFinishedAt: 1 } },
    );
    // Forged cross-owner event: user B claims A's game.
    await Activity.create({
      userId: new Types.ObjectId(seed.userBId),
      type: "game.finished",
      userGameId: new Types.ObjectId(seed.userGameMarioA),
      game: { name: "Super Mario 64" },
      metadata: { timesFinished: 1 },
    });
    await backfillLastFinishedAt();
    // A's genuine event still recovers A's record…
    expect(await lastFinishedAtOf(seed.userGameMarioA)).toBeInstanceOf(Date);
    // …while B's records stay untouched.
    expect(await lastFinishedAtOf(seed.userGameTetrisB)).toBeNull();
  });
});
