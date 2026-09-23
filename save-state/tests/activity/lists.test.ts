import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import { POST as createList } from "@/app/api/game-lists/route";
import {
  DELETE as deleteList,
  PATCH as renameList,
} from "@/app/api/game-lists/[listId]/route";
import {
  DELETE as removeFromList,
  POST as addToList,
} from "@/app/api/games/[gameId]/lists/[listId]/route";
import { Activity } from "@/db/models/activity";
import { GameList } from "@/db/models/game-list";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
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

async function createUserGameId(token: string, name: string): Promise<string> {
  const response = await createGame(
    authed("/api/games", token, {
      method: "POST",
      body: { game: { name } },
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()).data._id as string);
}

async function createListId(token: string, name: string): Promise<string> {
  const response = await createList(
    authed("/api/game-lists", token, { method: "POST", body: { name } }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()).data._id as string);
}

function listParams(listId: string) {
  return { params: Promise.resolve({ listId }) };
}

function membershipParams(gameId: string, listId: string) {
  return { params: Promise.resolve({ gameId, listId }) };
}

async function activityTypes(): Promise<string[]> {
  const docs = await Activity.find({}).sort({ _id: 1 }).lean();
  return docs.map((doc) => doc.type);
}

async function noTop10Events(): Promise<void> {
  const docs = await Activity.find({ type: /^top10\./ }).lean();
  expect(docs).toHaveLength(0);
}

describe("createGameList → list.created", () => {
  it("records creation with listId snapshot and empty metadata", async () => {
    const token = await tokenFor();
    const listId = await createListId(token, "Wishlist");

    const docs = await Activity.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe("list.created");
    expect(docs[0].list).toMatchObject({ listId, name: "Wishlist" });
    expect(docs[0].metadata).toEqual({});
    await noTop10Events();
  });
});

describe("updateGameList → list.renamed", () => {
  it("records effective renames with the new snapshot", async () => {
    const token = await tokenFor();
    const listId = await createListId(token, "Old Name");

    const response = await renameList(
      authed(`/api/game-lists/${listId}`, token, {
        method: "PATCH",
        body: { name: "New Name" },
      }),
      listParams(listId),
    );
    expect(response.status).toBe(200);

    expect(await activityTypes()).toEqual(["list.created", "list.renamed"]);
    const renamed = await Activity.findOne({ type: "list.renamed" }).lean();
    expect(renamed?.metadata).toEqual({ from: "Old Name", to: "New Name" });
    expect(renamed?.list).toMatchObject({ listId, name: "New Name" });
    await noTop10Events();
  });

  it("emits nothing when renaming to the same name", async () => {
    const token = await tokenFor();
    const listId = await createListId(token, "Same");

    const response = await renameList(
      authed(`/api/game-lists/${listId}`, token, {
        method: "PATCH",
        body: { name: "Same" },
      }),
      listParams(listId),
    );
    expect(response.status).toBe(200);
    expect(await activityTypes()).toEqual(["list.created"]);
  });
});

describe("deleteGameList → list.deleted", () => {
  it("preserves snapshot and pre-delete memberCount", async () => {
    const token = await tokenFor();
    const listId = await createListId(token, "Concluídos");
    const first = await createUserGameId(token, "Game A");
    const second = await createUserGameId(token, "Game B");
    for (const gameId of [first, second]) {
      const added = await addToList(
        authed(`/api/games/${gameId}/lists/${listId}`, token, { method: "POST" }),
        membershipParams(gameId, listId),
      );
      expect(added.status).toBe(204);
    }

    const response = await deleteList(
      authed(`/api/game-lists/${listId}`, token, { method: "DELETE" }),
      listParams(listId),
    );
    expect(response.status).toBe(204);

    expect(await GameList.findById(listId)).toBeNull();
    expect(await UserGame.countDocuments({ listIds: listId })).toBe(0);
    const deleted = await Activity.findOne({ type: "list.deleted" }).lean();
    expect(deleted?.list).toMatchObject({ listId, name: "Concluídos" });
    expect(deleted?.metadata).toEqual({ memberCount: 2 });
    await noTop10Events();
  });

  it("emits nothing when the list does not exist", async () => {
    const token = await tokenFor();
    const missing = "000000000000000000000000";
    const response = await deleteList(
      authed(`/api/game-lists/${missing}`, token, { method: "DELETE" }),
      listParams(missing),
    );
    expect(response.status).toBe(404);
    expect(await Activity.countDocuments()).toBe(0);
  });
});

describe("membership → game.added_to_list / game.removed_from_list", () => {
  it("records effective adds with game and list snapshots", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Hollow Knight");
    const listId = await createListId(token, "Favoritos 2");

    const added = await addToList(
      authed(`/api/games/${gameId}/lists/${listId}`, token, { method: "POST" }),
      membershipParams(gameId, listId),
    );
    expect(added.status).toBe(204);

    expect(await activityTypes()).toEqual([
      "game.added",
      "list.created",
      "game.added_to_list",
    ]);
    const event = await Activity.findOne({ type: "game.added_to_list" }).lean();
    expect(String(event?.userGameId)).toBe(gameId);
    expect(event?.game).toMatchObject({ name: "Hollow Knight" });
    expect(event?.list).toMatchObject({ listId, name: "Favoritos 2" });
    expect(event?.metadata).toEqual({});
    await noTop10Events();
  });

  it("emits nothing when adding an existing member", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Dup Member");
    const listId = await createListId(token, "Lista");
    const path = `/api/games/${gameId}/lists/${listId}`;
    expect(
      (await addToList(authed(path, token, { method: "POST" }), membershipParams(gameId, listId))).status,
    ).toBe(204);
    expect(
      (await addToList(authed(path, token, { method: "POST" }), membershipParams(gameId, listId))).status,
    ).toBe(204);

    expect(
      await Activity.countDocuments({ type: "game.added_to_list" }),
    ).toBe(1);
    const userGame = await UserGame.findById(gameId).lean();
    expect(userGame?.listIds.map(String)).toEqual([listId]);
  });

  it("records effective removals and keeps membership correct", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Leaving");
    const listId = await createListId(token, "Temp");
    const path = `/api/games/${gameId}/lists/${listId}`;
    await addToList(authed(path, token, { method: "POST" }), membershipParams(gameId, listId));

    const removed = await removeFromList(
      authed(path, token, { method: "DELETE" }),
      membershipParams(gameId, listId),
    );
    expect(removed.status).toBe(204);
    expect((await UserGame.findById(gameId).lean())?.listIds).toHaveLength(0);

    const event = await Activity.findOne({
      type: "game.removed_from_list",
    }).lean();
    expect(String(event?.userGameId)).toBe(gameId);
    expect(event?.game).toMatchObject({ name: "Leaving" });
    expect(event?.list).toMatchObject({ listId, name: "Temp" });
    await noTop10Events();
  });

  it("emits nothing when removing an absent membership", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Never Member");
    const listId = await createListId(token, "Other");
    const path = `/api/games/${gameId}/lists/${listId}`;

    const removed = await removeFromList(
      authed(path, token, { method: "DELETE" }),
      membershipParams(gameId, listId),
    );
    expect(removed.status).toBe(204);
    expect(
      await Activity.countDocuments({ type: "game.removed_from_list" }),
    ).toBe(0);
  });
});

describe("consistency", () => {
  it("a persistence failure does not fail the mutation", async () => {
    const token = await tokenFor();
    const createSpy = vi
      .spyOn(Activity, "create")
      .mockRejectedValueOnce(new Error("db down"));
    try {
      const response = await createList(
        authed("/api/game-lists", token, {
          method: "POST",
          body: { name: "Resilient" },
        }),
      );
      expect(response.status).toBe(201);
      expect(await GameList.countDocuments()).toBe(1);
      expect(await Activity.countDocuments()).toBe(0);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("creates no activity when the primary mutation fails", async () => {
    const token = await tokenFor();
    expect(
      (await createList(
        authed("/api/game-lists", token, { method: "POST", body: { name: "Dup" } }),
      )).status,
    ).toBe(201);
    const duplicate = await createList(
      authed("/api/game-lists", token, { method: "POST", body: { name: "Dup" } }),
    );
    expect(duplicate.status).toBe(400);

    const gameId = await createUserGameId(token, "Orphan Add");
    const missing = "000000000000000000000000";
    const foreign = await addToList(
      authed(`/api/games/${gameId}/lists/${missing}`, token, { method: "POST" }),
      membershipParams(gameId, missing),
    );
    expect(foreign.status).toBe(404);

    // Only the two successful creations were recorded.
    expect(await activityTypes()).toEqual([
      "list.created",
      "game.added",
    ]);
  });
});
