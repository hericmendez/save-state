import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import {
  DELETE as deleteGame,
  PATCH as patchGame,
} from "@/app/api/games/[gameId]/route";
import {
  DELETE as removeTop10,
  POST as addTop10,
} from "@/app/api/top10/[userGameId]/route";
import { PATCH as reorderTop10 } from "@/app/api/top10/route";
import { Activity } from "@/db/models/activity";
import { GlobalGame } from "@/db/models/global-game";
import { User } from "@/db/models/user";
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

async function createFavoriteId(
  token: string,
  name: string,
  extra?: Record<string, unknown>,
): Promise<string> {
  const response = await createGame(
    authed("/api/games", token, {
      method: "POST",
      body: { game: { name, ...extra }, favorite: true },
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()).data._id as string);
}

function top10Params(id: string) {
  return { params: Promise.resolve({ userGameId: id }) };
}

async function addToTop10(token: string, id: string): Promise<number> {
  const response = await addTop10(
    authed(`/api/top10/${id}`, token, { method: "POST" }),
    top10Params(id),
  );
  return response.status;
}

async function top10Events(): Promise<
  Array<{ type: string; metadata: unknown; game?: unknown }>
> {
  const docs = await Activity.find({ type: /^top10\./ })
    .sort({ _id: 1 })
    .lean();
  return docs.map((doc) => ({
    type: doc.type,
    metadata: doc.metadata,
    game: doc.game,
  }));
}

describe("addToTop10 → top10.added", () => {
  it("records effective adds with position and snapshot", async () => {
    const token = await tokenFor();
    const first = await createFavoriteId(token, "Game A");
    const second = await createFavoriteId(
      token,
      "Game B",
      { cover: "https://img.test/b.png" },
    );
    expect(await addToTop10(token, first)).toBe(201);
    expect(await addToTop10(token, second)).toBe(201);

    expect(await top10Events()).toEqual([
      {
        type: "top10.added",
        metadata: { position: 1 },
        game: { name: "Game A" },
      },
      {
        type: "top10.added",
        metadata: { position: 2 },
        game: { name: "Game B", cover: "https://img.test/b.png" },
      },
    ]);
  });

  it("emits nothing on duplicate adds", async () => {
    const token = await tokenFor();
    const id = await createFavoriteId(token, "Dup");
    expect(await addToTop10(token, id)).toBe(201);
    const duplicate = await addTop10(
      authed(`/api/top10/${id}`, token, { method: "POST" }),
      top10Params(id),
    );
    expect(duplicate.status).toBe(400);
    expect(await top10Events()).toHaveLength(1);
  });
});

describe("removeFromTop10 → top10.removed", () => {
  it("records manual removals with position and reason", async () => {
    const token = await tokenFor();
    const ids = [
      await createFavoriteId(token, "A"),
      await createFavoriteId(token, "B"),
      await createFavoriteId(token, "C"),
    ];
    for (const id of ids) expect(await addToTop10(token, id)).toBe(201);

    const removed = await removeTop10(
      authed(`/api/top10/${ids[1]}`, token, { method: "DELETE" }),
      top10Params(ids[1]),
    );
    expect(removed.status).toBe(204);

    const events = await top10Events();
    expect(events).toHaveLength(4);
    expect(events[3]).toEqual({
      type: "top10.removed",
      metadata: { position: 2, reason: "manual" },
      game: { name: "B" },
    });
  });

  it("emits nothing when removing an absent game", async () => {
    const token = await tokenFor();
    const id = await createFavoriteId(token, "Never Ranked");
    const removed = await removeTop10(
      authed(`/api/top10/${id}`, token, { method: "DELETE" }),
      top10Params(id),
    );
    expect(removed.status).toBe(204);
    expect(await top10Events()).toHaveLength(0);
  });

  it("unfavorite emits exactly one top10.removed with reason unfavorited", async () => {
    const token = await tokenFor();
    const id = await createFavoriteId(token, "Was Fav");
    expect(await addToTop10(token, id)).toBe(201);

    const patched = await patchGame(
      authed(`/api/games/${id}`, token, {
        method: "PATCH",
        body: { favorite: false },
      }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(patched.status).toBe(200);

    expect(await top10Events()).toEqual([
      { type: "top10.added", metadata: { position: 1 }, game: { name: "Was Fav" } },
      {
        type: "top10.removed",
        metadata: { position: 1, reason: "unfavorited" },
        game: { name: "Was Fav" },
      },
    ]);
    // The game event from Phase B is still produced, and the pull happened.
    const gameEvents = await Activity.find({ type: /^game\./ })
      .sort({ _id: 1 })
      .lean();
    expect(gameEvents.map((doc) => doc.type)).toContain("game.unfavorited");
    expect((await User.findOne({}).lean())?.top10 ?? []).toHaveLength(0);
  });

  it("game deletion emits exactly one top10.removed with reason game_deleted", async () => {
    const token = await tokenFor();
    const id = await createFavoriteId(token, "Doomed");
    expect(await addToTop10(token, id)).toBe(201);

    const deleted = await deleteGame(
      authed(`/api/games/${id}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(deleted.status).toBe(204);

    expect(await top10Events()).toEqual([
      { type: "top10.added", metadata: { position: 1 }, game: { name: "Doomed" } },
      {
        type: "top10.removed",
        metadata: { position: 1, reason: "game_deleted" },
        game: { name: "Doomed" },
      },
    ]);
    const gameEvents = await Activity.find({ type: /^game\./ })
      .sort({ _id: 1 })
      .lean();
    expect(gameEvents.map((doc) => doc.type)).toEqual([
      "game.added",
      "game.removed",
    ]);
  });
});

describe("reorderTop10 → single top10.reordered", () => {
  it("records effective reorders exactly once with count", async () => {
    const token = await tokenFor();
    const ids = [
      await createFavoriteId(token, "A"),
      await createFavoriteId(token, "B"),
      await createFavoriteId(token, "C"),
    ];
    for (const id of ids) expect(await addToTop10(token, id)).toBe(201);
    const before = await top10Events();
    expect(before).toHaveLength(3);

    const reversed = [...ids].reverse();
    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: reversed } }),
    );
    expect(response.status).toBe(200);

    const events = await top10Events();
    expect(events).toHaveLength(4);
    expect(events[3]).toEqual({
      type: "top10.reordered",
      metadata: {
        count: 3,
        moves: [
          { userGameId: reversed[0], from: 3, to: 1, game: { name: "C" } },
          { userGameId: reversed[2], from: 1, to: 3, game: { name: "A" } },
        ],
      },
      game: undefined,
    });
  });

  it("emits nothing when the order does not change", async () => {
    const token = await tokenFor();
    const ids = [
      await createFavoriteId(token, "A"),
      await createFavoriteId(token, "B"),
    ];
    for (const id of ids) expect(await addToTop10(token, id)).toBe(201);

    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: ids } }),
    );
    expect(response.status).toBe(200);
    expect((await top10Events()).map((event) => event.type)).toEqual([
      "top10.added",
      "top10.added",
    ]);
  });

  it("freezes name and cover snapshots in moves", async () => {
    const token = await tokenFor();
    const plain = await createFavoriteId(token, "No Cover");
    const covered = await createFavoriteId(token, "With Cover", {
      cover: "https://img.test/cover.png",
    });
    expect(await addToTop10(token, plain)).toBe(201);
    expect(await addToTop10(token, covered)).toBe(201);

    const response = await reorderTop10(
      authed("/api/top10", token, {
        method: "PATCH",
        body: { top10: [covered, plain] },
      }),
    );
    expect(response.status).toBe(200);

    const events = await top10Events();
    const reordered = events.find((event) => event.type === "top10.reordered");
    expect(reordered?.metadata).toEqual({
      count: 2,
      moves: [
        {
          userGameId: covered,
          from: 2,
          to: 1,
          game: { name: "With Cover", cover: "https://img.test/cover.png" },
        },
        { userGameId: plain, from: 1, to: 2, game: { name: "No Cover" } },
      ],
    });
  });

  it("count equals moves.length on a full swap", async () => {
    const token = await tokenFor();
    const first = await createFavoriteId(token, "First");
    const second = await createFavoriteId(token, "Second");
    expect(await addToTop10(token, first)).toBe(201);
    expect(await addToTop10(token, second)).toBe(201);

    await reorderTop10(
      authed("/api/top10", token, {
        method: "PATCH",
        body: { top10: [second, first] },
      }),
    );
    const reordered = await Activity.findOne({ type: "top10.reordered" }).lean();
    const metadata = reordered?.metadata as { count: number; moves: unknown[] };
    expect(metadata.count).toBe(2);
    expect(metadata.moves).toHaveLength(2);
    expect(metadata.count).toBe(metadata.moves.length);
  });

  it("later catalog edits do not alter the frozen presentation", async () => {
    const { groupActivities } = await import("@/features/activity/grouping");
    const token = await tokenFor();
    const first = await createFavoriteId(token, "Original Name");
    const second = await createFavoriteId(token, "Second");
    expect(await addToTop10(token, first)).toBe(201);
    expect(await addToTop10(token, second)).toBe(201);
    await reorderTop10(
      authed("/api/top10", token, {
        method: "PATCH",
        body: { top10: [second, first] },
      }),
    );

    const stored = await Activity.findOne({ type: "top10.reordered" }).lean();
    const toDTO = () => ({
      _id: String(stored?._id),
      type: "top10.reordered",
      metadata: (stored?.metadata ?? {}) as Record<string, unknown>,
      createdAt: (stored?.createdAt ?? new Date()).toISOString(),
    });
    const beforeRename = groupActivities([toDTO()]);

    await GlobalGame.updateOne(
      { name: "Original Name" },
      { $set: { name: "Renamed Later" } },
    );
    const afterRename = groupActivities([toDTO()]);

    expect(afterRename).toEqual(beforeRename);
    expect(afterRename[0].title).toBe("Second é seu Top 1 favorito!");
  });
});

describe("consistency", () => {
  it("a persistence failure does not fail the mutation", async () => {
    const token = await tokenFor();
    const id = await createFavoriteId(token, "Resilient");
    const createSpy = vi
      .spyOn(Activity, "create")
      .mockRejectedValueOnce(new Error("db down"));
    try {
      expect(await addToTop10(token, id)).toBe(201);
      const user = await User.findOne({}).lean();
      expect((user?.top10 ?? []).map(String)).toEqual([id]);
      expect(await top10Events()).toHaveLength(0);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("creates no activity when the primary mutation fails", async () => {
    const token = await tokenFor();
    const id = await createFavoriteId(token, "Not For Top10", undefined);
    // Make it non-favorite via direct update so the add fails cleanly.
    await patchGame(
      authed(`/api/games/${id}`, token, {
        method: "PATCH",
        body: { favorite: false },
      }),
      { params: Promise.resolve({ gameId: id }) },
    );
    const before = await Activity.countDocuments();
    const rejected = await addTop10(
      authed(`/api/top10/${id}`, token, { method: "POST" }),
      top10Params(id),
    );
    expect(rejected.status).toBe(400);
    expect(await Activity.countDocuments()).toBe(before);
    expect(await top10Events()).toHaveLength(0);
  });
});
