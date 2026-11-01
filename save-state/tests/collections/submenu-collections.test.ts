import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import {
  DELETE as deleteList,
  PATCH as renameList,
} from "@/app/api/game-collections/[collectionId]/route";
import {
  GET as listGames,
  POST as createList,
} from "@/app/api/game-collections/route";
import { POST as createGame } from "@/app/api/games/route";
import { GET as library } from "@/app/api/games/route";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

/**
 * Etapa 5.1 — submenu collection integrity at the contract level (the
 * submenu consumes exactly these endpoints): renaming preserves
 * memberships, deleting preserves games/favorites and surfaces them in
 * Jogos sem coleção (withoutCollection).
 */
beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  const response = await login(
    postRequest("/api/auth/login", { email: TEST_USER.email, password: TEST_USER.password }),
  );
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

async function createCollection(token: string, name: string): Promise<string> {
  const response = await createList(
    authedRequest("/api/game-collections", token, { method: "POST", body: { name } }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { _id: string } }).data._id;
}

async function createManualGame(token: string, name: string): Promise<string> {
  const response = await createGame(
    authedRequest("/api/games", token, {
      method: "POST",
      body: { game: { name, platforms: ["PC"] } },
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { _id: string } }).data._id;
}

describe("Etapa 5.1 — submenu collection integrity", () => {
  it("rename preserves memberships and validation still applies", async () => {
    const token = await tokenFor();
    const collectionId = await createCollection(token, "RPGs");
    const gameId = await createManualGame(token, "Chrono Trigger");
    const attach = await (
      await import("@/app/api/games/[gameId]/collections/[collectionId]/route")
    ).POST(authedRequest(`/api/games/${gameId}/collections/${collectionId}`, token, { method: "POST" }), {
      params: Promise.resolve({ gameId, collectionId }),
    });
    expect(attach.status).toBe(204);

    const renamed = await renameList(
      authedRequest(`/api/game-collections/${collectionId}`, token, {
        method: "PATCH",
        body: { name: "RPGs clássicos" },
      }),
      { params: Promise.resolve({ collectionId }) },
    );
    expect(renamed.status).toBe(200);

    const game = await UserGame.findById(gameId).lean();
    expect(game?.collectionIds.map(String)).toContain(collectionId);

    // Duplicate names are still rejected (existing validation reused).
    await createCollection(token, "Outros");
    const dup = await renameList(
      authedRequest(`/api/game-collections/${collectionId}`, token, {
        method: "PATCH",
        body: { name: "Outros" },
      }),
      { params: Promise.resolve({ collectionId }) },
    );
    expect(dup.status).toBe(400);
  });

  it("delete preserves games, cleans collectionIds, keeps favorites, surfaces withoutCollection", async () => {
    const token = await tokenFor();
    const collectionId = await createCollection(token, "Para zerar");
    const keepId = await createCollection(token, "Favoritos reais");
    const gameId = await createManualGame(token, "Chrono Trigger");
    const otherId = await createManualGame(token, "Tetris");

    const listsRoute = await import("@/app/api/games/[gameId]/collections/[collectionId]/route");
    for (const [g, l] of [[gameId, collectionId], [gameId, keepId], [otherId, keepId]] as const) {
      const res = await listsRoute.POST(
        authedRequest(`/api/games/${g}/collections/${l}`, token, { method: "POST" }),
        { params: Promise.resolve({ gameId: g, collectionId: l }) },
      );
      expect(res.status).toBe(204);
    }
    // Favorite one game: favorites must survive the list deletion.
    const fav = await (
      await import("@/app/api/games/[gameId]/route")
    ).PATCH(
      authedRequest(`/api/games/${gameId}`, token, { method: "PATCH", body: { favorite: true } }),
      { params: Promise.resolve({ gameId }) },
    );
    expect(fav.status).toBe(200);

    const deleted = await deleteList(
      authedRequest(`/api/game-collections/${collectionId}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ collectionId }) },
    );
    expect(deleted.status).toBe(204);

    // Games and the GlobalGame catalog survive; only the tag is gone.
    expect(await UserGame.countDocuments({})).toBe(2);
    expect(await GlobalGame.countDocuments({})).toBe(2);
    const survivor = await UserGame.findById(gameId).lean();
    expect(survivor?.collectionIds.map(String)).toEqual([keepId]);
    expect(survivor?.favorite).toBe(true);

    // The other list is untouched.
    const kept = await UserGame.findById(otherId).lean();
    expect(kept?.collectionIds.map(String)).toEqual([keepId]);

    // withoutCollection now surfaces the game that lost its only tag... here
    // gameId still has keepId, so only a fully-untagged game appears.
    // Detach keepId from gameId to prove the Jogos sem coleção semantic.
    await listsRoute.DELETE(
      authedRequest(`/api/games/${gameId}/collections/${keepId}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId, collectionId: keepId }) },
    );
    const without = await library(authedRequest("/api/games?withoutCollection=true", token));
    const body = (await without.json()) as { data: Array<{ _id: string }> };
    expect(body.data.map((g) => g._id)).toContain(gameId);
    expect(body.data.map((g) => g._id)).not.toContain(otherId);
  });

  it("submenu index reflects create/rename/delete (no reload needed by API)", async () => {
    const token = await tokenFor();
    const collectionId = await createCollection(token, "Temp");
    let index = (await (await listGames(authedRequest("/api/game-collections", token))).json()) as {
      data: Array<{ _id: string; name: string }>;
    };
    expect(index.data.map((l) => l.name)).toContain("Temp");

    await renameList(
      authedRequest(`/api/game-collections/${collectionId}`, token, {
        method: "PATCH",
        body: { name: "Temp renomeada" },
      }),
      { params: Promise.resolve({ collectionId }) },
    );
    index = (await (await listGames(authedRequest("/api/game-collections", token))).json()) as {
      data: Array<{ _id: string; name: string }>;
    };
    expect(index.data.map((l) => l.name)).toContain("Temp renomeada");

    await deleteList(authedRequest(`/api/game-collections/${collectionId}`, token, { method: "DELETE" }), {
      params: Promise.resolve({ collectionId }),
    });
    index = (await (await listGames(authedRequest("/api/game-collections", token))).json()) as {
      data: Array<{ _id: string; name: string }>;
    };
    expect(index.data.map((l) => l.name)).not.toContain("Temp renomeada");
  });
});
