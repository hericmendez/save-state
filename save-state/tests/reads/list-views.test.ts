/**
 * Fase 4 — Minhas Listas sobre a UserGame Collection.
 *
 * Covers: empty lists as a legitimate state, listId combined with search /
 * pagination / ordering through the same infrastructure, the explicit
 * listId × withoutList contradiction (conjunctive → empty), removing the
 * last list surfacing the game under "Sem lista", and delete-detach
 * consistency (no orphan references).
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listGamesInListRoute } from "@/app/api/game-lists/[listId]/games/route";
import { GlobalGame } from "@/db/models/global-game";
import { GameList } from "@/db/models/game-list";
import { User } from "@/db/models/user";
import { UserGame } from "@/db/models/user-game";
import { listGames } from "@/server/games/service";
import {
  deleteGameList,
  listGamesInList,
  removeListFromGame,
} from "@/server/lists/service";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

let userId: string;
let listId: string;
let gameInList: string;
let gameUntracked: string;
let gameAlsoInList: string;

async function seedListView(): Promise<void> {
  const user = await User.create({
    name: "List Viewer",
    email: "list-viewer@test.com",
    passwordHash: "hash",
  });
  userId = String(user._id);

  const [zelda, mario, tetris] = await Promise.all([
    GlobalGame.create({
      slug: "lv-zelda",
      name: "Zelda: Ocarina of Time",
      source: "manual",
      platforms: ["N64"],
      releaseDate: new Date("1998-11-21T00:00:00Z"),
    }),
    GlobalGame.create({
      slug: "lv-mario",
      name: "Mario 64",
      source: "manual",
      platforms: ["N64"],
      releaseDate: new Date("1996-06-23T00:00:00Z"),
    }),
    GlobalGame.create({
      slug: "lv-tetris",
      name: "Tetris",
      source: "manual",
      platforms: ["Game Boy"],
    }),
  ]);

  const list = await GameList.create({ userId: user._id, name: "To Play" });
  listId = String(list._id);

  const [ug1, ug2, ug3] = await Promise.all([
    UserGame.create({
      userId: user._id,
      gameId: zelda._id,
      status: "finished",
      listIds: [list._id],
    }),
    UserGame.create({
      userId: user._id,
      gameId: mario._id,
      status: "playing",
      listIds: [],
    }),
    UserGame.create({
      userId: user._id,
      gameId: tetris._id,
      status: "backlog",
      listIds: [list._id],
    }),
  ]);
  gameInList = String(ug1._id);
  gameUntracked = String(ug2._id);
  gameAlsoInList = String(ug3._id);
}

function names(result: { data: { game: { name: string } }[] }): string[] {
  return result.data.map((entry) => entry.game.name);
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  await seedListView();
});

describe("list detail views", () => {
  it("returns only the list members through the shared query", async () => {
    const result = await listGamesInList(userId, listId, {
      page: 1,
      limit: 20,
    });
    expect(result.pagination.total).toBe(2);
    expect(names(result).sort()).toEqual(["Tetris", "Zelda: Ocarina of Time"]);
  });

  it("combines listId with search, ordering and pagination", async () => {
    const result = await listGamesInList(userId, listId, {
      page: 1,
      limit: 1,
      search: "z",
      orderBy: "title",
      order: "asc",
    });
    expect(result.pagination.total).toBe(1);
    expect(names(result)).toEqual(["Zelda: Ocarina of Time"]);
  });

  it("treats an empty list as legitimate (total 0, not an error)", async () => {
    const empty = await GameList.create({ userId, name: "Empty" });
    const result = await listGamesInList(userId, String(empty._id), {
      page: 1,
      limit: 20,
    });
    expect(result.pagination).toMatchObject({ total: 0, totalPages: 0 });
    expect(result.data).toEqual([]);
  });

  it("resolves listId × withoutList conjunctively (empty, no precedence)", async () => {
    const result = await listGames(userId, {
      page: 1,
      limit: 20,
      listId,
      withoutList: true,
    });
    expect(result.pagination.total).toBe(0);
    expect(result.data).toEqual([]);
  });

  it("serves the contradiction through GET /:listId/games as empty", async () => {
    const { signToken } = await import("@/server/auth/session");
    const user = await User.findById(userId).lean();
    const token = signToken({
      userId,
      sessionVersion: user?.sessionVersion ?? 0,
    });
    const request = new NextRequest(
      `http://localhost/api/game-lists/${listId}/games?withoutList=true`,
      { headers: { cookie: `token=${token}` } },
    );
    const response = await listGamesInListRoute(request, {
      params: Promise.resolve({ listId }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).pagination.total).toBe(0);
  });
});

describe("membership transitions", () => {
  it("removing the last list surfaces the game under Sem lista", async () => {
    await removeListFromGame(userId, gameInList, listId);
    const untracked = await listGames(userId, {
      page: 1,
      limit: 20,
      withoutList: true,
    });
    expect(names(untracked)).toContain("Zelda: Ocarina of Time");

    const inList = await listGamesInList(userId, listId, {
      page: 1,
      limit: 20,
    });
    expect(names(inList)).not.toContain("Zelda: Ocarina of Time");

    // The records themselves are preserved.
    expect(await UserGame.findById(gameInList)).not.toBeNull();
    expect(await GameList.findById(listId)).not.toBeNull();
  });

  it("deleting a list detaches members without orphans", async () => {
    await deleteGameList(userId, listId);
    expect(await GameList.findById(listId)).toBeNull();

    const leftovers = await UserGame.find({
      userId,
      listIds: listId,
    });
    expect(leftovers).toEqual([]);

    // Former members are now untracked — Sem lista heals automatically.
    const untracked = await listGames(userId, {
      page: 1,
      limit: 20,
      withoutList: true,
    });
    expect(untracked.pagination.total).toBe(3);
    expect(gameUntracked).toBeDefined();
    expect(gameAlsoInList).toBeDefined();
  });
});
