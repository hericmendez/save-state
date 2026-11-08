import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UserGame } from "@/db/models/user-game";
import { GameReview } from "@/db/models/game-review";
import { buildReviewExcerpt } from "@/server/reviews/excerpt";
import {
  planReviewMigration,
  runReviewMigrationLive,
} from "@/server/reviews/migration";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

const uid = () => new Types.ObjectId();
const gid = () => new Types.ObjectId();

describe("review migration (isolated database only)", () => {
  it("is idempotent: dry-run plans, live creates once, rerun is stable", async () => {
    const userId = uid();
    const a = await UserGame.create({ userId, gameId: gid(), review: "First" });
    await UserGame.create({ userId, gameId: gid(), review: "Second" });
    await UserGame.create({ userId, gameId: gid() }); // no review

    const plan1 = await planReviewMigration();
    expect(plan1.withLegacyReview).toBe(2);
    expect(plan1.eligible).toBe(2);
    expect(plan1.created).toBe(0);
    expect(await GameReview.countDocuments()).toBe(0);

    const live1 = await runReviewMigrationLive();
    expect(live1.created).toBe(2);
    expect(await GameReview.countDocuments()).toBe(2);
    const stored = await GameReview.findOne({ userGameId: a._id }).lean();
    expect(stored?.content).toBe("First");

    const plan2 = await planReviewMigration();
    expect(plan2.eligible).toBe(0);
    expect(plan2.alreadyMigrated).toBe(2);

    const live2 = await runReviewMigrationLive();
    expect(live2.created).toBe(0);
    expect(await GameReview.countDocuments()).toBe(2);
  });

  it("never overwrites existing reviews; reports conflicts", async () => {
    const userId = uid();
    const ug = await UserGame.create({
      userId,
      gameId: gid(),
      review: "Legacy diverged",
    });
    await GameReview.create({
      userGameId: ug._id,
      userId,
      content: "# Newer edited body",
    });

    const plan = await planReviewMigration();
    expect(plan.conflicts).toBe(1);
    expect(plan.eligible).toBe(0);

    const live = await runReviewMigrationLive();
    expect(live.created).toBe(0);
    const kept = await GameReview.findOne({ userGameId: ug._id }).lean();
    expect(kept?.content).toBe("# Newer edited body");
    const untouched = await UserGame.findById(ug._id)
      .select("reviewExcerpt")
      .lean();
    expect(untouched?.reviewExcerpt ?? undefined).toBeUndefined();
  });

  it("heals missing excerpts without touching the body (C3 backfill)", async () => {
    const userId = uid();
    const ug = await UserGame.create({
      userId,
      gameId: gid(),
      review: "Healing body",
    });
    await GameReview.create({
      userGameId: ug._id,
      userId,
      content: "Healing body",
    });

    const plan = await planReviewMigration();
    expect(plan.excerptMissing).toBe(1);
    expect(plan.eligible).toBe(0);

    const live = await runReviewMigrationLive();
    expect(live.created).toBe(0);
    expect(live.excerptBackfilled).toBe(1);
    const healed = await UserGame.findById(ug._id)
      .select("reviewExcerpt")
      .lean();
    expect(healed?.reviewExcerpt).toBe(buildReviewExcerpt("Healing body"));

    const rerun = await runReviewMigrationLive();
    expect(rerun.excerptBackfilled).toBe(0);
    expect((await planReviewMigration()).alreadyMigrated).toBe(1);
  });

  it("repairs stale excerpts to match the canonical body (C3 backfill)", async () => {
    const userId = uid();
    const ug = await UserGame.create({
      userId,
      gameId: gid(),
      review: "Canonical text here",
      reviewExcerpt: "outdated preview",
    });
    await GameReview.create({
      userGameId: ug._id,
      userId,
      content: "Canonical text here",
    });

    expect((await planReviewMigration()).excerptStale).toBe(1);
    const live = await runReviewMigrationLive();
    expect(live.excerptBackfilled).toBe(1);
    const fixed = await UserGame.findById(ug._id)
      .select("reviewExcerpt review")
      .lean();
    expect(fixed?.reviewExcerpt).toBe(
      buildReviewExcerpt("Canonical text here"),
    );
    expect(fixed?.review).toBe("Canonical text here");
  });

  it("treats a concurrent duplicate-key as already-migrated, not an error (M4)", async () => {
    const userId = uid();
    const ug = await UserGame.create({
      userId,
      gameId: gid(),
      review: "Racy",
    });
    await GameReview.create({
      userGameId: ug._id,
      userId,
      content: "Racy",
    });
    // Simulate a stale pre-check: a concurrent live run won the race, so
    // our existence lookup misses and the real unique index raises E11000.
    const findSpy = vi.spyOn(GameReview, "findOne");
    findSpy.mockImplementationOnce((() => ({
      select: () => ({ lean: () => ({ exec: async () => null }) }),
    })) as never);
    let live;
    try {
      live = await runReviewMigrationLive();
    } finally {
      findSpy.mockRestore();
    }
    expect(live.errors).toBe(0);
    expect(live.created).toBe(0);
    expect(await GameReview.countDocuments({ userGameId: ug._id })).toBe(1);
    // Equivalent body, but the preview was never derived for this
    // directly-created fixture → counted as missing excerpt (healable),
    // not as fully migrated. The M4 point stands: no error, no duplicate.
    expect((await planReviewMigration()).excerptMissing).toBe(1);
  });

  it("classifies a divergent concurrent winner as conflict, never overwriting (M4)", async () => {
    const userId = uid();
    const ug = await UserGame.create({
      userId,
      gameId: gid(),
      review: "Old text",
    });
    await GameReview.create({
      userGameId: ug._id,
      userId,
      content: "New body",
    });
    const findSpy = vi.spyOn(GameReview, "findOne");
    findSpy.mockImplementationOnce((() => ({
      select: () => ({ lean: () => ({ exec: async () => null }) }),
    })) as never);
    let live;
    try {
      live = await runReviewMigrationLive();
    } finally {
      findSpy.mockRestore();
    }
    expect(live.errors).toBe(0);
    expect(live.created).toBe(0);
    const kept = await GameReview.findOne({ userGameId: ug._id }).lean();
    expect(kept?.content).toBe("New body");
    const plan = await planReviewMigration();
    expect(plan.conflicts).toBe(1);
    expect(plan.eligible).toBe(0);
  });
});
