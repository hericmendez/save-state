import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listListsRoute } from "@/app/api/game-collections/route";
import { GET as getListRoute } from "@/app/api/game-collections/[collectionId]/route";
import { GET as listGamesInCollectionRoute } from "@/app/api/game-collections/[collectionId]/games/route";
import { signToken } from "@/server/auth/session";
import {
  getGameCollection,
  listGameCollections,
  listGamesInCollection,
} from "@/server/collections/service";
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

function tokenFor(userId: string): string {
  return signToken({ userId, sessionVersion: 0 });
}

function authedGet(path: string, userId: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `token=${tokenFor(userId)}` },
  });
}

describe("listGameCollections service", () => {
  it("returns the caller's collections sorted by name", async () => {
    const result = await listGameCollections(seed.userAId, {
      page: 1,
      limit: 20,
      withCount: false,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].name).toBe("Favorites");
    expect(result.data[0]).not.toHaveProperty("gameCount");
  });

  it("includes game counts only with withCount=true", async () => {
    const result = await listGameCollections(seed.userAId, {
      page: 1,
      limit: 20,
      withCount: true,
    });
    expect(result.data[0].gameCount).toBe(1);
  });

  it("isolates users", async () => {
    const result = await listGameCollections(seed.userBId, {
      page: 1,
      limit: 20,
      withCount: false,
    });
    expect(result.pagination.total).toBe(0);
  });

  it("searches by partial name", async () => {
    const result = await listGameCollections(seed.userAId, {
      page: 1,
      limit: 20,
      withCount: false,
      search: "favor",
    });
    expect(result.pagination.total).toBe(1);
  });
});

describe("getGameCollection service", () => {
  it("returns the owned collection", async () => {
    const list = await getGameCollection(seed.userAId, seed.collectionFavoritesA);
    expect(list.name).toBe("Favorites");
  });

  it("rejects cross-user access with LIST_NOT_FOUND", async () => {
    await expect(
      getGameCollection(seed.userBId, seed.collectionFavoritesA),
    ).rejects.toMatchObject({ code: "LIST_NOT_FOUND" });
  });

  it("rejects malformed ids with INVALID_LIST_ID", async () => {
    await expect(getGameCollection(seed.userAId, "nope")).rejects.toMatchObject({
      code: "INVALID_LIST_ID",
    });
  });
});

describe("listGamesInCollection service", () => {
  it("returns games carrying the collection id", async () => {
    const result = await listGamesInCollection(seed.userAId, seed.collectionFavoritesA, {
      page: 1,
      limit: 20,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].game.name).toContain("Zelda");
  });

  it("rejects foreign lists with LIST_NOT_FOUND", async () => {
    await expect(
      listGamesInCollection(seed.userBId, seed.collectionFavoritesA, {
        page: 1,
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: "LIST_NOT_FOUND" });
  });
});

describe("GET /api/game-collections", () => {
  it("requires authentication", async () => {
    const response = await listListsRoute(
      new NextRequest("http://localhost/api/game-collections"),
    );
    expect(response.status).toBe(401);
  });

  it("returns the raw paginated envelope", async () => {
    const response = await listListsRoute(
      authedGet("/api/game-collections?withCount=true", seed.userAId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].gameCount).toBe(1);
  });
});

describe("GET /api/game-collections/:collectionId", () => {
  it("returns { data } for the owned collection", async () => {
    const response = await getListRoute(
      authedGet(`/api/game-collections/${seed.collectionFavoritesA}`, seed.userAId),
      { params: Promise.resolve({ collectionId: seed.collectionFavoritesA }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.name).toBe("Favorites");
  });

  it("rejects foreign lists with LIST_NOT_FOUND", async () => {
    const response = await getListRoute(
      authedGet(`/api/game-collections/${seed.collectionFavoritesA}`, seed.userBId),
      { params: Promise.resolve({ collectionId: seed.collectionFavoritesA }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/game-collections/:collectionId/games", () => {
  it("returns the paginated games of the owned collection", async () => {
    const response = await listGamesInCollectionRoute(
      authedGet(
        `/api/game-collections/${seed.collectionFavoritesA}/games`,
        seed.userAId,
      ),
      { params: Promise.resolve({ collectionId: seed.collectionFavoritesA }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].game.name).toContain("Zelda");
  });
});
