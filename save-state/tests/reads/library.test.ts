/**
 * Fase 3 — Minha Biblioteca: Jogos / Favoritos / Sem lista.
 *
 * Covers the new UserGame query semantics (service + route): favorite,
 * withoutList (listIds.length === 0, applied in the database), status,
 * platform, yearFrom/yearTo, and server-side ordering with pagination
 * applied over the already-ordered result.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listGamesRoute } from "@/app/api/games/route";
import { GlobalGame } from "@/db/models/global-game";
import { GameList } from "@/db/models/game-list";
import { User } from "@/db/models/user";
import { UserGame } from "@/db/models/user-game";
import { listGames } from "@/server/games/service";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

let userId: string;

async function seedLibrary(): Promise<void> {
  const user = await User.create({
    name: "Librarian",
    email: "librarian@test.com",
    passwordHash: "hash",
  });
  userId = String(user._id);

  const [zelda, mario, tetris, chrono] = await Promise.all([
    GlobalGame.create({
      slug: "lib-zelda",
      name: "Zelda: Ocarina of Time",
      source: "manual",
      platforms: ["N64"],
      releaseDate: new Date("1998-11-21T00:00:00Z"),
    }),
    GlobalGame.create({
      slug: "lib-mario",
      name: "Mario 64",
      source: "manual",
      platforms: ["N64"],
      releaseDate: new Date("1996-06-23T00:00:00Z"),
    }),
    GlobalGame.create({
      slug: "lib-tetris",
      name: "Tetris",
      source: "manual",
      platforms: ["Game Boy"],
    }),
    GlobalGame.create({
      slug: "lib-chrono",
      name: "Chrono Trigger",
      source: "manual",
      platforms: ["SNES"],
      releaseDate: new Date("1995-03-11T00:00:00Z"),
    }),
  ]);

  const list = await GameList.create({ userId: user._id, name: "Played" });

  await UserGame.create({
    userId: user._id,
    gameId: zelda._id,
    status: "finished",
    favorite: true,
    listIds: [list._id],
  });
  await UserGame.create({
    userId: user._id,
    gameId: mario._id,
    status: "playing",
    favorite: false,
    listIds: [],
  });
  await UserGame.create({
    userId: user._id,
    gameId: tetris._id,
    status: "backlog",
    favorite: true,
    listIds: [],
  });
  await UserGame.create({
    userId: user._id,
    gameId: chrono._id,
    status: "playing",
    favorite: false,
    listIds: [],
  });
}

function names(result: { data: { game: { name: string } }[] }): string[] {
  return result.data.map((entry) => entry.game.name);
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  await seedLibrary();
});

describe("library views", () => {
  it("Jogos: returns everything without implicit favorite/withoutList", async () => {
    const result = await listGames(userId, { page: 1, limit: 20 });
    expect(result.pagination.total).toBe(4);
  });

  it("Favoritos: matches favorite === true", async () => {
    const result = await listGames(userId, {
      page: 1,
      limit: 20,
      favorite: true,
    });
    expect(result.pagination.total).toBe(2);
    expect(names(result).sort()).toEqual(["Tetris", "Zelda: Ocarina of Time"]);
  });

  it("Sem lista: matches listIds.length === 0 in the database", async () => {
    const result = await listGames(userId, {
      page: 1,
      limit: 20,
      withoutList: true,
    });
    expect(result.pagination.total).toBe(3);
    expect(names(result)).not.toContain("Zelda: Ocarina of Time");
  });

  it("withoutList=false behaves like no filter", async () => {
    const result = await listGames(userId, {
      page: 1,
      limit: 20,
      withoutList: false,
    });
    expect(result.pagination.total).toBe(4);
  });

  it("filters by status and combines with favorite/search/year", async () => {
    const byStatus = await listGames(userId, {
      page: 1,
      limit: 20,
      status: "playing",
    });
    expect(names(byStatus).sort()).toEqual(["Chrono Trigger", "Mario 64"]);

    const combo = await listGames(userId, {
      page: 1,
      limit: 20,
      favorite: true,
      status: "backlog",
      search: "tet",
    });
    expect(names(combo)).toEqual(["Tetris"]);

    // A year range needs a stored releaseDate: dateless games never match.
    const comboWithYear = await listGames(userId, {
      page: 1,
      limit: 20,
      favorite: true,
      status: "backlog",
      search: "tet",
      yearFrom: 1900,
      yearTo: 2100,
    });
    expect(names(comboWithYear)).toEqual([]);
  });

  it("filters by platform and year range", async () => {
    const byPlatform = await listGames(userId, {
      page: 1,
      limit: 20,
      platform: "n64",
    });
    expect(byPlatform.pagination.total).toBe(2);

    const byYear = await listGames(userId, {
      page: 1,
      limit: 20,
      yearFrom: 1996,
      yearTo: 1998,
    });
    expect(names(byYear).sort()).toEqual([
      "Mario 64",
      "Zelda: Ocarina of Time",
    ]);
  });
});

describe("library ordering", () => {
  it("orders by title ASC/DESC", async () => {
    const asc = await listGames(userId, {
      page: 1,
      limit: 20,
      orderBy: "title",
      order: "asc",
    });
    expect(names(asc)).toEqual([
      "Chrono Trigger",
      "Mario 64",
      "Tetris",
      "Zelda: Ocarina of Time",
    ]);
    const desc = await listGames(userId, {
      page: 1,
      limit: 20,
      orderBy: "title",
      order: "desc",
    });
    expect(names(desc)).toEqual([...names(asc)].reverse());
  });

  it("orders by release year with dateless games last in both directions", async () => {
    const asc = await listGames(userId, {
      page: 1,
      limit: 20,
      orderBy: "releaseYear",
      order: "asc",
    });
    expect(names(asc)).toEqual([
      "Chrono Trigger",
      "Mario 64",
      "Zelda: Ocarina of Time",
      "Tetris",
    ]);
    const desc = await listGames(userId, {
      page: 1,
      limit: 20,
      orderBy: "releaseYear",
      order: "desc",
    });
    expect(names(desc)).toEqual([
      "Zelda: Ocarina of Time",
      "Mario 64",
      "Chrono Trigger",
      "Tetris",
    ]);
  });

  it("orders by status and by first platform", async () => {
    const byStatus = await listGames(userId, {
      page: 1,
      limit: 20,
      orderBy: "status",
      order: "asc",
    });
    expect(names(byStatus)[0]).toBe("Tetris"); // backlog first
    expect(names(byStatus)).toContain("Zelda: Ocarina of Time");

    const byPlatform = await listGames(userId, {
      page: 1,
      limit: 20,
      orderBy: "platform",
      order: "asc",
    });
    expect(names(byPlatform)[0]).toBe("Tetris"); // Game Boy first
    expect(names(byPlatform)[names(byPlatform).length - 1]).toBe(
      "Chrono Trigger", // SNES last
    );
  });

  it("paginates over the ordered result", async () => {
    const page2 = await listGames(userId, {
      page: 2,
      limit: 2,
      orderBy: "title",
      order: "asc",
    });
    expect(page2.pagination).toMatchObject({ total: 4, totalPages: 2 });
    expect(names(page2)).toEqual(["Tetris", "Zelda: Ocarina of Time"]);
  });

  it("keeps legacy newest-first order without orderBy", async () => {
    const result = await listGames(userId, { page: 1, limit: 20 });
    expect(result.pagination.total).toBe(4);
  });
});

describe("GET /api/games library params", () => {
  async function authedRequest(query: string): Promise<NextRequest> {
    const { signToken } = await import("@/server/auth/session");
    const user = await User.findById(userId).lean();
    const token = signToken({
      userId,
      sessionVersion: user?.sessionVersion ?? 0,
    });
    return new NextRequest(`http://localhost/api/games${query}`, {
      headers: { cookie: `token=${token}` },
    });
  }

  it("serves withoutList + ordering through the route", async () => {
    const response = await listGamesRoute(
      await authedRequest("?withoutList=true&orderBy=title&order=asc&limit=50"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination.total).toBe(3);
    expect(body.data.map((entry: { game: { name: string } }) => entry.game.name)).toEqual([
      "Chrono Trigger",
      "Mario 64",
      "Tetris",
    ]);
  });

  it("rejects unknown orderBy/status with INVALID_QUERY", async () => {
    const badSort = await listGamesRoute(
      await authedRequest("?orderBy=rating"),
    );
    expect(badSort.status).toBe(400);
    expect((await badSort.json()).error.code).toBe("INVALID_QUERY");

    const badStatus = await listGamesRoute(
      await authedRequest("?status=completed"),
    );
    expect(badStatus.status).toBe(400);
  });
});
