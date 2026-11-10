import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as importGame } from "@/app/api/atp/import/route";
import { GET as search } from "@/app/api/atp/search/route";
import { GET as listGames } from "@/app/api/games/route";
import {
  DELETE as deleteGame,
  PATCH as patchGame,
  PUT as putGame,
} from "@/app/api/games/[gameId]/route";
import { POST as finishGame } from "@/app/api/games/[gameId]/finish/route";
import {
  DELETE as removeFromList,
  POST as addToList,
} from "@/app/api/games/[gameId]/collections/[collectionId]/route";
import { POST as createList } from "@/app/api/game-collections/route";
import { GET as statsRoute } from "@/app/api/games/stats/route";
import { GET as exportJson } from "@/app/api/auth/export/route";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { listGames as listGamesService } from "@/server/games/service";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { ATP_GAME_FIXTURE } from "./client.test";

const ATP_ID = "atp-wikipedia-6509467";

function atpGamePayload() {
  return { data: ATP_GAME_FIXTURE, origin: "database" };
}

function atpCoverPayload(url: string | null = "https://img.example/c.jpg") {
  return {
    data: {
      gameId: ATP_ID,
      selected: url
        ? { url, width: 300, height: 400, source: "steam" }
        : null,
      candidates: [],
    },
    origin: "database",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubAtp(handler: (path: string) => Response | Promise<Response>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const path = new URL(url).pathname;
      expect(url.startsWith("http://atp.test")).toBe(true);
      return handler(path);
    }),
  );
}

function stubFullCatalog() {
  stubAtp((path) => {
    if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
    if (path === `/api/v1/games/${ATP_ID}/cover`) return jsonResponse(atpCoverPayload());
    return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
  });
}

beforeAll(async () => {
  await startTestDatabase();
  process.env.ATP_BASE_URL = "http://atp.test";
});
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  process.env.ATP_BASE_URL = "http://atp.test";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function tokenFor(): Promise<string> {
  await register(postRequest("/api/auth/register", TEST_USER));
  const response = await login(postRequest("/api/auth/login", {
    email: TEST_USER.email,
    password: TEST_USER.password,
  }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

function authed(path: string, token: string, init?: { method?: string; body?: unknown }): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      cookie: `token=${token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function gameParams(gameId: string) {
  return { params: Promise.resolve({ gameId }) };
}

async function importChrono(token: string): Promise<string> {
  const response = await importGame(
    authed("/api/atp/import", token, {
      method: "POST",
      body: { atpId: ATP_ID },
    }),
  );
  expect(response.status).toBe(201);
  const body = await response.json();
  return body.data._id as string;
}

describe("import → GlobalGame snapshot shape", () => {
  it("stores source/atpDomainId, flattened metadata, cover, and no summary", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);

    const stored = await GlobalGame.findOne({ atpDomainId: ATP_ID }).lean();
    expect(stored?.source).toBe("atp");
    expect(stored?.atpDomainId).toBe(ATP_ID);
    expect(stored?.name).toBe("Chrono Trigger");
    expect(stored?.platforms).toEqual(["SNES", "PlayStation"]);
    expect(stored?.genres).toEqual(["RPG"]);
    expect(stored?.cover).toBe("https://img.example/c.jpg");
    expect(stored?.releaseDate?.getUTCFullYear()).toBe(1995);
    expect(stored?.summary ?? null).toBeNull();

    const userGame = await UserGame.findById(userGameId).lean();
    expect(String(userGame?.gameId)).toBe(String(stored?._id));
  });
});

describe("import → UserGame parity with manual games", () => {
  it("appears in the backlog list", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    await importChrono(token);
    const response = await listGames(authed("/api/games", token));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].game.name).toBe("Chrono Trigger");
  });

  it("supports favorite, status, rating, review, hours mutations", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    const response = await patchGame(
      authed(`/api/games/${userGameId}`, token, {
        method: "PATCH",
        body: {
          favorite: true,
          status: "playing",
          hoursPlayed: 12,
          rating: 10,
          review: { content: "Masterpiece" },
        },
      }),
      gameParams(userGameId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      favorite: true,
      status: "playing",
      hoursPlayed: 12,
      rating: 10,
    });
    expect(body.data.review).toBeUndefined();
    expect(body.data.reviewExcerpt).toContain("Masterpiece");
  });

  it("supports Zerei +1, fullyCompleted, and achievements", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);

    const finished = await finishGame(
      authed(`/api/games/${userGameId}/finish`, token, { method: "POST" }),
      gameParams(userGameId),
    );
    expect(finished.status).toBe(200);
    expect(await finished.json()).toMatchObject({
      data: { timesFinished: 1, finished: true },
    });

    const completed = await patchGame(
      authed(`/api/games/${userGameId}`, token, {
        method: "PATCH",
        body: { fullyCompleted: true, achievements: true, achievementProgress: 100 },
      }),
      gameParams(userGameId),
    );
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({
      data: { fullyCompleted: true, achievementsCompleted: true },
    });
  });

  it("accepts personal-only PUT on ATP games", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    const response = await putGame(
      authed(`/api/games/${userGameId}`, token, {
        method: "PUT",
        body: { status: "finished", rating: 9 },
      }),
      gameParams(userGameId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("finished");
    expect(body.data.rating).toBe(9);
    expect(body.data.game.name).toBe("Chrono Trigger");
  });

  it("rejects mixed personal+metadata PUT atomically (no partial commit)", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    const response = await putGame(
      authed(`/api/games/${userGameId}`, token, {
        method: "PUT",
        body: { status: "playing", game: { name: "Hacked" } },
      }),
      gameParams(userGameId),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("GAME_METADATA_IMMUTABLE");
    // Atomic: the personal change must NOT have been applied.
    const stored = await UserGame.findById(userGameId).lean();
    expect(stored?.status).toBe("backlog");
    expect(await GlobalGame.countDocuments({ name: "Hacked" })).toBe(0);
  });

  it("still applies mixed PUT on manual games (no regression)", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    await GlobalGame.updateOne({ atpDomainId: ATP_ID }, { $set: { source: "manual" } });
    const response = await putGame(
      authed(`/api/games/${userGameId}`, token, {
        method: "PUT",
        body: { status: "playing", game: { name: "Renamed" } },
      }),
      gameParams(userGameId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("playing");
    expect(body.data.game.name).toBe("Renamed");
  });

  it("supports list attach and detach", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    const list = await (
      await createList(authed("/api/game-collections", token, {
        method: "POST",
        body: { name: "JRPGs" },
      }))
    ).json();
    const collectionId = list.data._id as string;

    const attached = await addToList(
      authed(`/api/games/${userGameId}/collections/${collectionId}`, token, { method: "POST" }),
      { params: Promise.resolve({ gameId: userGameId, collectionId }) },
    );
    expect(attached.status).toBe(204);
    expect((await UserGame.findById(userGameId).lean())?.collectionIds.map(String)).toContain(collectionId);

    const detached = await removeFromList(
      authed(`/api/games/${userGameId}/collections/${collectionId}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId: userGameId, collectionId }) },
    );
    expect(detached.status).toBe(204);
    expect((await UserGame.findById(userGameId).lean())?.collectionIds ?? []).toHaveLength(0);
  });

  it("appears in stats, favorites reads, and exports without ATP", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    await patchGame(
      authed(`/api/games/${userGameId}`, token, {
        method: "PATCH",
        body: { favorite: true, status: "finished" },
      }),
      gameParams(userGameId),
    );
    const owner = await UserGame.findById(userGameId).lean();
    const ownerId = String(owner?.userId);

    // Snapshot reads must not depend on ATP: restore the real fetch
    // (which cannot reach the stub host) for all reads below.
    vi.unstubAllGlobals();

    const stats = await statsRoute(authed("/api/games/stats", token));
    expect(stats.status).toBe(200);
    const statsBody = await stats.json();
    expect(statsBody.data.totalGames).toBe(1);
    expect(statsBody.data.byStatus).toEqual({ finished: 1 });

    const favorites = await listGamesService(ownerId, {
      favorite: true,
      page: 1,
      limit: 20,
    });
    expect(favorites.pagination.total).toBe(1);
    expect(favorites.data[0].game.name).toBe("Chrono Trigger");

    const exported = await exportJson(authed("/api/auth/export", token));
    expect(exported.status).toBe(200);
    const payload = await exported.json();
    expect(payload.games).toHaveLength(1);
    expect(payload.games[0].game.name).toBe("Chrono Trigger");
  });

  it("delete removes the UserGame but preserves the shared GlobalGame", async () => {
    stubFullCatalog();
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    const response = await deleteGame(
      authed(`/api/games/${userGameId}`, token, { method: "DELETE" }),
      gameParams(userGameId),
    );
    expect(response.status).toBe(204);
    expect(await UserGame.countDocuments()).toBe(0);
    expect(await GlobalGame.countDocuments({ atpDomainId: ATP_ID })).toBe(1);
  });
});

describe("ATP failure modes → controlled errors, no partial writes", () => {
  async function expectCleanImportFailure(
    token: string,
    body: unknown,
    status: number,
    code: string,
  ) {
    const response = await importGame(
      authed("/api/atp/import", token, { method: "POST", body }),
    );
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(await GlobalGame.countDocuments()).toBe(0);
    expect(await UserGame.countDocuments()).toBe(0);
  }

  it("maps ATP connection failure to ATP_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    const token = await tokenFor();
    await expectCleanImportFailure(token, { atpId: ATP_ID }, 503, "ATP_UNAVAILABLE");
  });

  it("maps ATP malformed responses to INTERNAL_ERROR without leaking", async () => {
    stubAtp(() => new Response("not-json{{{", { status: 200 }));
    const token = await tokenFor();
    await expectCleanImportFailure(token, { atpId: ATP_ID }, 500, "INTERNAL_ERROR");
  });

  it("maps ATP 500 during import to ATP_UNAVAILABLE", async () => {
    stubAtp(() => jsonResponse({ error: { code: "BOOM" } }, 500));
    const token = await tokenFor();
    await expectCleanImportFailure(token, { atpId: ATP_ID }, 503, "ATP_UNAVAILABLE");
  });

  it("maps ATP 429 on search to RATE_LIMIT_EXCEEDED", async () => {
    stubAtp(() => jsonResponse({ error: { code: "RATE_LIMITED" } }, 429));
    const token = await tokenFor();
    const response = await search(authed("/api/atp/search?q=chrono", token));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("degrades cover failure: valid game still imports without cover", async () => {
    stubAtp((path) => {
      if (path === `/api/v1/games/${ATP_ID}`) return jsonResponse(atpGamePayload());
      return jsonResponse({ error: { code: "SOURCE_ERROR" } }, 502);
    });
    const token = await tokenFor();
    const userGameId = await importChrono(token);
    const stored = await GlobalGame.findOne({ atpDomainId: ATP_ID }).lean();
    expect(stored?.cover ?? null).toBeNull();
    expect(await UserGame.countDocuments({ _id: userGameId })).toBe(1);
  });
});
