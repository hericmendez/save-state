import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listListsRoute } from "@/app/api/game-lists/route";
import { GET as getListRoute } from "@/app/api/game-lists/[listId]/route";
import { GET as listGamesInListRoute } from "@/app/api/game-lists/[listId]/games/route";
import { signToken } from "@/server/auth/session";
import {
  getGameList,
  listGameLists,
  listGamesInList,
} from "@/server/lists/service";
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

describe("listGameLists service", () => {
  it("returns the caller's lists sorted by name", async () => {
    const result = await listGameLists(seed.userAId, {
      page: 1,
      limit: 20,
      withCount: false,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].name).toBe("Favorites");
    expect(result.data[0]).not.toHaveProperty("gameCount");
  });

  it("includes game counts only with withCount=true", async () => {
    const result = await listGameLists(seed.userAId, {
      page: 1,
      limit: 20,
      withCount: true,
    });
    expect(result.data[0].gameCount).toBe(1);
  });

  it("isolates users", async () => {
    const result = await listGameLists(seed.userBId, {
      page: 1,
      limit: 20,
      withCount: false,
    });
    expect(result.pagination.total).toBe(0);
  });

  it("searches by partial name", async () => {
    const result = await listGameLists(seed.userAId, {
      page: 1,
      limit: 20,
      withCount: false,
      search: "favor",
    });
    expect(result.pagination.total).toBe(1);
  });
});

describe("getGameList service", () => {
  it("returns the owned list", async () => {
    const list = await getGameList(seed.userAId, seed.listFavoritesA);
    expect(list.name).toBe("Favorites");
  });

  it("rejects cross-user access with LIST_NOT_FOUND", async () => {
    await expect(
      getGameList(seed.userBId, seed.listFavoritesA),
    ).rejects.toMatchObject({ code: "LIST_NOT_FOUND" });
  });

  it("rejects malformed ids with INVALID_LIST_ID", async () => {
    await expect(getGameList(seed.userAId, "nope")).rejects.toMatchObject({
      code: "INVALID_LIST_ID",
    });
  });
});

describe("listGamesInList service", () => {
  it("returns games carrying the list id", async () => {
    const result = await listGamesInList(seed.userAId, seed.listFavoritesA, {
      page: 1,
      limit: 20,
    });
    expect(result.pagination.total).toBe(1);
    expect(result.data[0].game.name).toContain("Zelda");
  });

  it("rejects foreign lists with LIST_NOT_FOUND", async () => {
    await expect(
      listGamesInList(seed.userBId, seed.listFavoritesA, {
        page: 1,
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: "LIST_NOT_FOUND" });
  });
});

describe("GET /api/game-lists", () => {
  it("requires authentication", async () => {
    const response = await listListsRoute(
      new NextRequest("http://localhost/api/game-lists"),
    );
    expect(response.status).toBe(401);
  });

  it("returns the raw paginated envelope", async () => {
    const response = await listListsRoute(
      authedGet("/api/game-lists?withCount=true", seed.userAId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].gameCount).toBe(1);
  });
});

describe("GET /api/game-lists/:listId", () => {
  it("returns { data } for the owned list", async () => {
    const response = await getListRoute(
      authedGet(`/api/game-lists/${seed.listFavoritesA}`, seed.userAId),
      { params: Promise.resolve({ listId: seed.listFavoritesA }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.name).toBe("Favorites");
  });

  it("rejects foreign lists with LIST_NOT_FOUND", async () => {
    const response = await getListRoute(
      authedGet(`/api/game-lists/${seed.listFavoritesA}`, seed.userBId),
      { params: Promise.resolve({ listId: seed.listFavoritesA }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/game-lists/:listId/games", () => {
  it("returns the paginated games of the owned list", async () => {
    const response = await listGamesInListRoute(
      authedGet(
        `/api/game-lists/${seed.listFavoritesA}/games`,
        seed.userAId,
      ),
      { params: Promise.resolve({ listId: seed.listFavoritesA }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].game.name).toContain("Zelda");
  });
});
