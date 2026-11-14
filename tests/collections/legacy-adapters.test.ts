import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import {
  GET as legacyIndex,
  POST as legacyCreate,
} from "@/app/api/game-lists/route";
import {
  DELETE as legacyDelete,
  GET as legacyGet,
  PATCH as legacyPatch,
} from "@/app/api/game-lists/[listId]/route";
import { GET as legacyGames } from "@/app/api/game-lists/[listId]/games/route";
import {
  DELETE as legacyDetach,
  POST as legacyAttach,
} from "@/app/api/games/[gameId]/lists/[listId]/route";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { GameCollection } from "@/db/models/game-collection";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(
    postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
  );
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

function authed(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      cookie: `token=${token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/**
 * Temporary compat adapters (Etapa 6): the legacy /api/game-lists* and
 * /api/games/:id/lists/:id routes keep working by translating listId →
 * collectionId and delegating to the collections service. Removal only
 * after the migration is validated and no client uses them.
 */
describe("legacy /api/game-lists* adapters", () => {
  it("creates and reads through the legacy paths", async () => {
    const token = await tokenFor();
    const created = await legacyCreate(
      authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Legada" },
      }),
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { data: { _id: string } }).data._id;

    // Stored in the new model/collection.
    expect(await GameCollection.findById(id).lean()).not.toBeNull();

    const got = await legacyGet(authed(`/api/game-lists/${id}`, token), {
      params: Promise.resolve({ listId: id }),
    });
    expect(got.status).toBe(200);
    expect((await got.json()).data.name).toBe("Legada");

    const index = await legacyIndex(authed("/api/game-lists", token));
    expect(index.status).toBe(200);
    expect(((await index.json()) as { data: unknown[] }).data).toHaveLength(1);
  });

  it("renames and deletes through the legacy paths with legacy codes", async () => {
    const token = await tokenFor();
    const created = await legacyCreate(
      authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Antiga" },
      }),
    );
    const id = ((await created.json()) as { data: { _id: string } }).data._id;

    const renamed = await legacyPatch(
      authed(`/api/game-lists/${id}`, token, {
        method: "PATCH",
        body: { name: "Renomeada" },
      }),
      { params: Promise.resolve({ listId: id }) },
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).data.name).toBe("Renomeada");

    const removed = await legacyDelete(
      authed(`/api/game-lists/${id}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ listId: id }) },
    );
    expect(removed.status).toBe(204);
    expect(await GameCollection.countDocuments()).toBe(0);
  });

  it("attaches/detaches memberships through the legacy paths", async () => {
    const token = await tokenFor();
    const { POST: createGame } = await import("@/app/api/games/route");
    const gameId = (
      (await (
        await createGame(
          authed("/api/games", token, {
            method: "POST",
            body: { game: { name: "Jogo" } },
          }),
        )
      ).json()) as { data: { _id: string } }
    ).data._id;
    const created = await legacyCreate(
      authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Coleção" },
      }),
    );
    const id = ((await created.json()) as { data: { _id: string } }).data._id;

    const path = `/api/games/${gameId}/lists/${id}`;
    expect(
      (
        await legacyAttach(authed(path, token, { method: "POST" }), {
          params: Promise.resolve({ gameId, listId: id }),
        })
      ).status,
    ).toBe(204);
    const { UserGame } = await import("@/db/models/user-game");
    expect(
      (await UserGame.findById(gameId).lean())?.collectionIds.map(String),
    ).toEqual([id]);

    expect(
      (
        await legacyDetach(authed(path, token, { method: "DELETE" }), {
          params: Promise.resolve({ gameId, listId: id }),
        })
      ).status,
    ).toBe(204);
    expect(
      (await UserGame.findById(gameId).lean())?.collectionIds ?? [],
    ).toHaveLength(0);
  });

  it("lists games of a collection through the legacy nested path", async () => {
    const token = await tokenFor();
    const created = await legacyCreate(
      authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Com jogos" },
      }),
    );
    const id = ((await created.json()) as { data: { _id: string } }).data._id;
    const response = await legacyGames(authed(`/api/game-lists/${id}/games`, token), {
      params: Promise.resolve({ listId: id }),
    });
    expect(response.status).toBe(200);
  });
});
