import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import { POST as createCollection } from "@/app/api/game-collections/route";
import {
  DELETE as deleteCollection,
  PATCH as renameCollection,
} from "@/app/api/game-collections/[collectionId]/route";
import {
  DELETE as removeFromCollection,
  POST as addToCollection,
} from "@/app/api/games/[gameId]/collections/[collectionId]/route";
import { Activity } from "@/db/models/activity";
import { GameCollection } from "@/db/models/game-collection";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

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

async function createCollectionId(token: string, name: string): Promise<string> {
  const response = await createCollection(
    authed("/api/game-collections", token, { method: "POST", body: { name } }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()).data._id as string);
}

function collectionParams(collectionId: string) {
  return { params: Promise.resolve({ collectionId }) };
}

function membershipParams(gameId: string, collectionId: string) {
  return { params: Promise.resolve({ gameId, collectionId }) };
}

async function activityTypes(): Promise<string[]> {
  const docs = await Activity.find({}).sort({ _id: 1 }).lean();
  return docs.map((doc) => doc.type);
}

async function noTop10Events(): Promise<void> {
  const docs = await Activity.find({ type: /^top10\./ }).lean();
  expect(docs).toHaveLength(0);
}

describe("createGameCollection → collection.created", () => {
  it("records creation with collectionId snapshot and empty metadata", async () => {
    const token = await tokenFor();
    const collectionId = await createCollectionId(token, "Wishlist");

    const docs = await Activity.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe("collection.created");
    expect(docs[0].collection).toMatchObject({ collectionId, name: "Wishlist" });
    expect(docs[0].metadata).toEqual({});
    await noTop10Events();
  });
});

describe("updateGameCollection → collection.renamed", () => {
  it("records effective renames with the new snapshot", async () => {
    const token = await tokenFor();
    const collectionId = await createCollectionId(token, "Old Name");

    const response = await renameCollection(
      authed(`/api/game-collections/${collectionId}`, token, {
        method: "PATCH",
        body: { name: "New Name" },
      }),
      collectionParams(collectionId),
    );
    expect(response.status).toBe(200);

    expect(await activityTypes()).toEqual([
      "collection.created",
      "collection.renamed",
    ]);
    const renamed = await Activity.findOne({ type: "collection.renamed" }).lean();
    expect(renamed?.metadata).toEqual({ from: "Old Name", to: "New Name" });
    expect(renamed?.collection).toMatchObject({ collectionId, name: "New Name" });
    await noTop10Events();
  });

  it("emits nothing when renaming to the same name", async () => {
    const token = await tokenFor();
    const collectionId = await createCollectionId(token, "Same");

    const response = await renameCollection(
      authed(`/api/game-collections/${collectionId}`, token, {
        method: "PATCH",
        body: { name: "Same" },
      }),
      collectionParams(collectionId),
    );
    expect(response.status).toBe(200);
    expect(await activityTypes()).toEqual(["collection.created"]);
  });
});

describe("deleteGameCollection → collection.deleted", () => {
  it("preserves snapshot and pre-delete memberCount", async () => {
    const token = await tokenFor();
    const collectionId = await createCollectionId(token, "Concluídos");
    const first = await createUserGameId(token, "Game A");
    const second = await createUserGameId(token, "Game B");
    for (const gameId of [first, second]) {
      const added = await addToCollection(
        authed(`/api/games/${gameId}/collections/${collectionId}`, token, { method: "POST" }),
        membershipParams(gameId, collectionId),
      );
      expect(added.status).toBe(204);
    }

    const response = await deleteCollection(
      authed(`/api/game-collections/${collectionId}`, token, { method: "DELETE" }),
      collectionParams(collectionId),
    );
    expect(response.status).toBe(204);

    expect(await GameCollection.findById(collectionId)).toBeNull();
    expect(await UserGame.countDocuments({ collectionIds: collectionId })).toBe(0);
    const deleted = await Activity.findOne({ type: "collection.deleted" }).lean();
    expect(deleted?.collection).toMatchObject({ collectionId, name: "Concluídos" });
    expect(deleted?.metadata).toEqual({ memberCount: 2 });
    await noTop10Events();
  });

  it("emits nothing when the collection does not exist", async () => {
    const token = await tokenFor();
    const missing = "000000000000000000000000";
    const response = await deleteCollection(
      authed(`/api/game-collections/${missing}`, token, { method: "DELETE" }),
      collectionParams(missing),
    );
    expect(response.status).toBe(404);
    expect(await Activity.countDocuments()).toBe(0);
  });
});

describe("membership → game.added_to_collection / game.removed_from_collection", () => {
  it("records effective adds with game and collection snapshots", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Hollow Knight");
    const collectionId = await createCollectionId(token, "Favoritos 2");

    const added = await addToCollection(
      authed(`/api/games/${gameId}/collections/${collectionId}`, token, { method: "POST" }),
      membershipParams(gameId, collectionId),
    );
    expect(added.status).toBe(204);

    expect(await activityTypes()).toEqual([
      "game.added",
      "collection.created",
      "game.added_to_collection",
    ]);
    const event = await Activity.findOne({ type: "game.added_to_collection" }).lean();
    expect(String(event?.userGameId)).toBe(gameId);
    expect(event?.game).toMatchObject({ name: "Hollow Knight" });
    expect(event?.collection).toMatchObject({ collectionId, name: "Favoritos 2" });
    expect(event?.metadata).toEqual({});
    await noTop10Events();
  });

  it("emits nothing when adding an existing member", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Dup Member");
    const collectionId = await createCollectionId(token, "Lista");
    const path = `/api/games/${gameId}/collections/${collectionId}`;
    expect(
      (await addToCollection(authed(path, token, { method: "POST" }), membershipParams(gameId, collectionId))).status,
    ).toBe(204);
    expect(
      (await addToCollection(authed(path, token, { method: "POST" }), membershipParams(gameId, collectionId))).status,
    ).toBe(204);

    expect(
      await Activity.countDocuments({ type: "game.added_to_collection" }),
    ).toBe(1);
    const userGame = await UserGame.findById(gameId).lean();
    expect(userGame?.collectionIds.map(String)).toEqual([collectionId]);
  });

  it("records effective removals and keeps membership correct", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Leaving");
    const collectionId = await createCollectionId(token, "Temp");
    const path = `/api/games/${gameId}/collections/${collectionId}`;
    await addToCollection(authed(path, token, { method: "POST" }), membershipParams(gameId, collectionId));

    const removed = await removeFromCollection(
      authed(path, token, { method: "DELETE" }),
      membershipParams(gameId, collectionId),
    );
    expect(removed.status).toBe(204);
    expect((await UserGame.findById(gameId).lean())?.collectionIds).toHaveLength(0);

    const event = await Activity.findOne({
      type: "game.removed_from_collection",
    }).lean();
    expect(String(event?.userGameId)).toBe(gameId);
    expect(event?.game).toMatchObject({ name: "Leaving" });
    expect(event?.collection).toMatchObject({ collectionId, name: "Temp" });
    await noTop10Events();
  });

  it("emits nothing when removing an absent membership", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token, "Never Member");
    const collectionId = await createCollectionId(token, "Other");
    const path = `/api/games/${gameId}/collections/${collectionId}`;

    const removed = await removeFromCollection(
      authed(path, token, { method: "DELETE" }),
      membershipParams(gameId, collectionId),
    );
    expect(removed.status).toBe(204);
    expect(
      await Activity.countDocuments({ type: "game.removed_from_collection" }),
    ).toBe(0);
  });
});

describe("legacy list.* events stay readable", () => {
  it("old payloads still validate and render", async () => {
    const { parseActivityEvent } = await import("@/schemas/activity");
    const { singularMessage } = await import("@/features/activity/presentation");
    const oldCreated = parseActivityEvent({
      type: "list.created",
      list: { listId: "000000000000000000000001", name: "Wishlist" },
      metadata: {},
    });
    expect(oldCreated.type).toBe("list.created");
    expect(
      singularMessage({
        _id: "000000000000000000000099",
        type: oldCreated.type,
        list: { listId: "000000000000000000000001", name: "Wishlist" },
        metadata: {},
        createdAt: "2026-09-21T12:00:00.000Z",
      }),
    ).toBe('Você criou a lista "Wishlist".');

    const oldAdded = parseActivityEvent({
      type: "game.added_to_list",
      userGameId: "000000000000000000000002",
      game: { name: "Chrono Trigger" },
      list: { listId: "000000000000000000000001", name: "Wishlist" },
      metadata: {},
    });
    expect(oldAdded.type).toBe("game.added_to_list");
  });

  it("old and new membership events group independently", async () => {
    const { groupActivities } = await import("@/features/activity/grouping");
    const base = {
      _id: "000000000000000000000001",
      userGameId: "000000000000000000000002",
      game: { name: "Chrono Trigger" },
      metadata: {},
      createdAt: "2026-09-21T12:00:00.000Z",
    };
    const items = groupActivities([
      { ...base, _id: "a", type: "game.added_to_list", list: { listId: "1", name: "W" } },
      { ...base, _id: "b", type: "game.added_to_collection", collection: { collectionId: "1", name: "W" } },
    ] as never);
    // Same collection name but different event types must never merge:
    // history semantics are preserved per vocabulary.
    expect(items).toHaveLength(2);
  });
});

describe("consistency", () => {
  it("a persistence failure does not fail the mutation", async () => {
    const token = await tokenFor();
    const createSpy = vi
      .spyOn(Activity, "create")
      .mockRejectedValueOnce(new Error("db down"));
    try {
      const response = await createCollection(
        authed("/api/game-collections", token, {
          method: "POST",
          body: { name: "Resilient" },
        }),
      );
      expect(response.status).toBe(201);
      expect(await GameCollection.countDocuments()).toBe(1);
      expect(await Activity.countDocuments()).toBe(0);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("creates no activity when the primary mutation fails", async () => {
    const token = await tokenFor();
    expect(
      (await createCollection(
        authed("/api/game-collections", token, { method: "POST", body: { name: "Dup" } }),
      )).status,
    ).toBe(201);
    const duplicate = await createCollection(
      authed("/api/game-collections", token, { method: "POST", body: { name: "Dup" } }),
    );
    expect(duplicate.status).toBe(400);

    const gameId = await createUserGameId(token, "Orphan Add");
    const missing = "000000000000000000000000";
    const foreign = await addToCollection(
      authed(`/api/games/${gameId}/collections/${missing}`, token, { method: "POST" }),
      membershipParams(gameId, missing),
    );
    expect(foreign.status).toBe(404);

    // Only the two successful creations were recorded.
    expect(await activityTypes()).toEqual([
      "collection.created",
      "game.added",
    ]);
  });
});
