/**
 * Collection game counters (withCount aggregation + transitions).
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listRoute } from "@/app/api/game-collections/route";
import { signToken } from "@/server/auth/session";
import {
  addCollectionToGame,
  createGameCollection,
  deleteGameCollection,
  listGameCollections,
  listGamesInCollection,
  removeCollectionFromGame,
} from "@/server/collections/service";
import { deleteGame } from "@/server/games/service";
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

function tokenFor(userId: string): string {
  return signToken({ userId, sessionVersion: 0 });
}

async function counts(userId: string) {
  const result = await listGameCollections(userId, {
    page: 1,
    limit: 100,
    withCount: true,
  });
  return new Map(result.data.map((c) => [c.name, c.gameCount]));
}

describe("withCount aggregation", () => {
  it("counts a game in every collection holding it", async () => {
    const second = await createGameCollection(seed.userAId, {
      name: "Replay",
    });
    await addCollectionToGame(
      seed.userAId,
      seed.userGameZeldaA,
      String(second._id),
    );
    const map = await counts(seed.userAId);
    expect(map.get("Favorites")).toBe(1);
    expect(map.get("Replay")).toBe(1);
  });

  it("reports zero for empty collections", async () => {
    await createGameCollection(seed.userAId, { name: "Empty" });
    const map = await counts(seed.userAId);
    expect(map.get("Empty")).toBe(0);
  });

  it("ignores duplicate memberships", async () => {
    await addCollectionToGame(
      seed.userAId,
      seed.userGameZeldaA,
      seed.collectionFavoritesA,
    );
    const map = await counts(seed.userAId);
    expect(map.get("Favorites")).toBe(1);
  });

  it("isolates counts per user", async () => {
    const map = await counts(seed.userBId);
    expect(map.size).toBe(0);
  });

  it("omits the prop with withCount=false (legacy contract)", async () => {
    const result = await listGameCollections(seed.userAId, {
      page: 1,
      limit: 20,
      withCount: false,
    });
    for (const collection of result.data) {
      expect(collection).not.toHaveProperty("gameCount");
    }
    expect(result.pagination.total).toBe(1);
  });

  it("keeps pagination totals independent of withCount", async () => {
    const [plain, counted] = await Promise.all([
      listGameCollections(seed.userAId, {
        page: 1,
        limit: 20,
        withCount: false,
      }),
      listGameCollections(seed.userAId, {
        page: 1,
        limit: 20,
        withCount: true,
      }),
    ]);
    expect(counted.pagination).toEqual(plain.pagination);
  });
});

describe("count transitions", () => {
  it("drops to zero after remove", async () => {
    await removeCollectionFromGame(
      seed.userAId,
      seed.userGameZeldaA,
      seed.collectionFavoritesA,
    );
    expect((await counts(seed.userAId)).get("Favorites")).toBe(0);
  });

  it("drops to zero after deleting the member game", async () => {
    await deleteGame(seed.userAId, seed.userGameZeldaA);
    expect((await counts(seed.userAId)).get("Favorites")).toBe(0);
  });

  it("survives deleting a sibling collection", async () => {
    const second = await createGameCollection(seed.userAId, {
      name: "Replay",
    });
    await addCollectionToGame(
      seed.userAId,
      seed.userGameZeldaA,
      String(second._id),
    );
    await deleteGameCollection(seed.userAId, String(second._id));
    const map = await counts(seed.userAId);
    expect(map.get("Favorites")).toBe(1);
    expect(map.has("Replay")).toBe(false);
  });
});

describe("nav and page contracts", () => {
  it("serves gameCount through the nav query", async () => {
    const request = new NextRequest(
      "http://localhost/api/game-collections?limit=100&withCount=true",
      { headers: { cookie: `token=${tokenFor(seed.userAId)}` } },
    );
    // @ts-expect-error Next 15 route context unused here
    const response = await listRoute(request, {});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0]).toMatchObject({ name: "Favorites", gameCount: 1 });
  });

  it("keeps the collection total independent of list filters", async () => {
    const filtered = await listGamesInCollection(
      seed.userAId,
      seed.collectionFavoritesA,
      { page: 1, limit: 20, search: "no-such-game" },
    );
    expect(filtered.pagination.total).toBe(0);
    const map = await counts(seed.userAId);
    expect(map.get("Favorites")).toBe(1);
  });
});
