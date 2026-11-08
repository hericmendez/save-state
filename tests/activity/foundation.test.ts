import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Activity } from "@/db/models/activity";
import {
  parseActivityEvent,
} from "@/schemas/activity";
import { recordActivity } from "@/server/activity/service";
import { logger } from "@/server/shared/logger";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

const USER_ID = "000000000000000000000001";
const USER_GAME_ID = "000000000000000000000002";
const LIST_ID = "000000000000000000000003";

describe("parseActivityEvent (validation is mandatory)", () => {
  it("accepts a valid game event", () => {
    const event = parseActivityEvent({
      type: "game.status_changed",
      userGameId: USER_GAME_ID,
      game: { name: "Hollow Knight" },
      metadata: { from: "backlog", to: "playing" },
    });
    expect(event.type).toBe("game.status_changed");
  });

  it("accepts rating removal with to: null", () => {
    const event = parseActivityEvent({
      type: "game.rating_changed",
      userGameId: USER_GAME_ID,
      game: { name: "Hollow Knight", cover: "https://img.test/cover.png" },
      metadata: { from: 8, to: null },
    });
    if (event.type !== "game.rating_changed") throw new Error("wrong type");
    expect(event.metadata.to).toBeNull();
  });

  it("accepts list and top10 events with their snapshots", () => {
    expect(
      parseActivityEvent({
        type: "list.renamed",
        list: { listId: LIST_ID, name: "Novo nome" },
        metadata: { from: "Antigo", to: "Novo nome" },
      }).type,
    ).toBe("list.renamed");
    expect(
      parseActivityEvent({
        type: "top10.removed",
        userGameId: USER_GAME_ID,
        game: { name: "Hollow Knight" },
        metadata: { position: 3, reason: "unfavorited" },
      }).type,
    ).toBe("top10.removed");
    expect(
      parseActivityEvent({
        type: "top10.reordered",
        metadata: {
          count: 8,
          moves: [
            {
              userGameId: USER_GAME_ID,
              from: 4,
              to: 1,
              game: { name: "Ocarina of Time" },
            },
          ],
        },
      }).type,
    ).toBe("top10.reordered");
  });

  it("rejects metadata incompatible with the type", () => {
    expect(() =>
      parseActivityEvent({
        type: "game.status_changed",
        userGameId: USER_GAME_ID,
        game: { name: "Hollow Knight" },
        metadata: { timesFinished: 3 },
      }),
    ).toThrowError(/VALIDATION_ERROR|from/i);
  });

  it("rejects reorder moves without the required game snapshot", () => {
    expect(() =>
      parseActivityEvent({
        type: "top10.reordered",
        metadata: {
          count: 2,
          moves: [{ userGameId: USER_GAME_ID, from: 2, to: 1 }],
        },
      }),
    ).toThrow();
  });

  it("rejects unknown event types", () => {
    expect(() =>
      parseActivityEvent({
        type: "game.review_changed",
        userGameId: USER_GAME_ID,
        game: { name: "Hollow Knight" },
        metadata: {},
      }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    // game snapshot is required for game events
    expect(() =>
      parseActivityEvent({
        type: "game.favorited",
        userGameId: USER_GAME_ID,
        metadata: {},
      }),
    ).toThrow();
    // identical from/to is a no-op, not an event
    expect(() =>
      parseActivityEvent({
        type: "game.status_changed",
        userGameId: USER_GAME_ID,
        game: { name: "Hollow Knight" },
        metadata: { from: "playing", to: "playing" },
      }),
    ).toThrow();
  });
});

describe("recordActivity (persistence is best effort)", () => {
  it("persists a validated event", async () => {
    const event = parseActivityEvent({
      type: "game.finished",
      userGameId: USER_GAME_ID,
      game: { name: "Resident Evil 4" },
      metadata: { timesFinished: 23 },
    });
    const doc = await recordActivity(USER_ID, event);
    expect(doc).not.toBeNull();
    expect(String(doc?.userId)).toBe(USER_ID);
    expect(doc?.type).toBe("game.finished");
    expect(doc?.createdAt).toBeInstanceOf(Date);
    expect(await Activity.countDocuments()).toBe(1);
  });

  it("stores documents without updatedAt", async () => {
    const event = parseActivityEvent({
      type: "game.favorited",
      userGameId: USER_GAME_ID,
      game: { name: "Hollow Knight" },
      metadata: {},
    });
    const doc = await recordActivity(USER_ID, event);
    expect(doc).not.toBeNull();
    expect(
      (doc?.toObject() as Record<string, unknown> | undefined)?.updatedAt,
    ).toBeUndefined();
    expect(Activity.schema.path("updatedAt")).toBeUndefined();
  });

  it("swallows persistence failures: logs with userId+type, returns null, never throws", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const createSpy = vi
      .spyOn(Activity, "create")
      .mockRejectedValueOnce(new Error("db down"));
    try {
      const event = parseActivityEvent({
        type: "game.added",
        userGameId: USER_GAME_ID,
        game: { name: "Hollow Knight" },
        metadata: { source: "manual" },
      });
      // Must not throw: the caller's mutation continues normally.
      const result = await recordActivity(USER_ID, event);
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledOnce();
      const [, details] = errorSpy.mock.calls[0];
      expect(details).toMatchObject({ userId: USER_ID, type: "game.added" });
      // The failed diary write leaves no trace behind.
      expect(await Activity.countDocuments()).toBe(0);
    } finally {
      createSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe("Activity model", () => {
  it("declares the foundation indexes", () => {
    const indexes = Activity.schema.indexes().map(([spec]) => spec);
    expect(indexes).toContainEqual({ userId: 1, createdAt: -1 });
    expect(indexes).toContainEqual({ userId: 1, type: 1, createdAt: -1 });
    expect(indexes).toContainEqual({ userId: 1, userGameId: 1, createdAt: -1 });
  });
});
