/**
 * Pontual fixes follow-up: IGDB-sourced action, import+attach recovery,
 * external load errors, empty externalId, ATP policy ignorance.
 */

import { readFileSync } from "fs";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as neutralImport } from "@/app/api/search/import/route";
import { POST as createCollection } from "@/app/api/game-collections/route";
import { POST as attachToCollection } from "@/app/api/games/[gameId]/collections/[collectionId]/route";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { __resetServerEnvCache } from "@/lib/env";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import { __resetIgdbFilterCaches } from "@/server/search/igdb-provider";
import {
  TEST_USER,
  authedRequest,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

function hasPattern(path: string, patterns: string[]): boolean {
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const IGDB_GAME = {
  id: 1234,
  name: "Chrono Trigger",
  summary: "A time-travel RPG.",
  first_release_date: 798595200,
  genres: [{ id: 12, name: "Role-playing (RPG)" }],
  platforms: [{ id: 19, name: "Super Nintendo Entertainment System" }],
  involved_companies: [],
  cover: { id: 1, image_id: "abc" },
  game_type: 0,
};

const ATP_ID = "atp-wikipedia-6509467";
const ATP_FIXTURE = {
  id: ATP_ID,
  titles: [{ value: "Chrono Trigger", type: "primary" }],
  releases: [
    {
      platform: { name: "SNES" },
      region: { name: "JP" },
      releaseDate: { year: 1995, month: 3, day: 11, precision: "day" },
    },
  ],
  developers: [{ name: "Square" }],
  publishers: [{ name: "Square" }],
  genres: [{ name: "RPG" }],
  externalIdentifiers: [{ source: "wikipedia", id: "6509467" }],
};

function stubIgdbFetch(): void {
  process.env.SEARCH_METHOD = "IGDB";
  process.env.TWITCH_CLIENT_ID = "cid";
  process.env.TWITCH_CLIENT_SECRET = "secret";
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 });
      }
      if (url.endsWith("/games")) return jsonResponse([IGDB_GAME]);
      throw new Error(`unexpected IGDB call: ${url}`);
    }),
  );
}

function stubAtpFetch(): void {
  process.env.SEARCH_METHOD = "ATP";
  process.env.ATP_BASE_URL = "http://atp.test";
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const path = new URL(url).pathname;
      if (path === `/api/v1/games/${ATP_ID}`) {
        return jsonResponse({ data: ATP_FIXTURE, origin: "database" });
      }
      if (path === `/api/v1/games/${ATP_ID}/cover`) {
        return jsonResponse({
          data: {
            gameId: ATP_ID,
            selected: { url: "https://img.example/c.jpg", width: 1, height: 1, source: "x" },
            candidates: [],
          },
          origin: "database",
        });
      }
      throw new Error(`unexpected ATP call: ${url}`);
    }),
  );
}

beforeAll(async () => {
  await startTestDatabase();
});
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  __resetIgdbThrottle();
  __resetIgdbFilterCaches();
});
afterEach(() => {
  vi.unstubAllGlobals();
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  delete process.env.SEARCH_METHOD;
});

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

async function collectionIdFor(token: string): Promise<string> {
  const response = await createCollection(
    authedRequest("/api/game-collections", token, {
      method: "POST",
      body: { name: "Favoritos" },
    }),
    // @ts-expect-error Next 15 route context unused here
    {},
  );
  expect(response.status).toBe(201);
  return (await response.json()).data._id as string;
}

describe("import + collection attach composition", () => {
  it("imports with personal data and attaches to a collection", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const imported = await neutralImport(
      authedRequest("/api/search/import", token, {
        method: "POST",
        body: {
          externalId: "1234",
          personal: { status: "playing", rating: 9 },
          conflictPolicy: "reject-existing",
        },
      }),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(imported.status).toBe(201);
    const userGameId = (await imported.json()).data._id as string;
    const collectionId = await collectionIdFor(token);

    const attached = await attachToCollection(
      authedRequest(
        `/api/games/${userGameId}/collections/${collectionId}`,
        token,
        { method: "POST" },
      ),
      { params: Promise.resolve({ gameId: userGameId, collectionId }) },
    );
    expect(attached.status).toBe(204);
    const userGame = await UserGame.findById(userGameId).lean();
    expect(userGame?.collectionIds.map(String)).toEqual([collectionId]);
    expect(userGame).toMatchObject({ status: "playing", rating: 9 });
  });

  it("recovers a failed attach without duplicating or re-importing", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const imported = await neutralImport(
      authedRequest("/api/search/import", token, {
        method: "POST",
        body: { externalId: "1234", conflictPolicy: "reject-existing" },
      }),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(imported.status).toBe(201);
    const userGameId = (await imported.json()).data._id as string;

    // Attach fails (unknown collection) — the game is already in the library.
    const bogus = "000000000000000000000000";
    const failed = await attachToCollection(
      authedRequest(`/api/games/${userGameId}/collections/${bogus}`, token, {
        method: "POST",
      }),
      { params: Promise.resolve({ gameId: userGameId, collectionId: bogus }) },
    );
    expect(failed.status).toBe(404);

    // Re-running the import is now a library conflict, not a new record…
    const retry = await neutralImport(
      authedRequest("/api/search/import", token, {
        method: "POST",
        body: { externalId: "1234", conflictPolicy: "reject-existing" },
      }),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(retry.status).toBe(400);
    expect((await retry.json()).error.code).toBe("GAME_ALREADY_IN_LIBRARY");
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
    expect(await UserGame.countDocuments({})).toBe(1);

    // …so only the attach is retried, idempotently: twice is a no-op.
    const collectionId = await collectionIdFor(token);
    for (let attempt = 0; attempt < 2; attempt++) {
      const attached = await attachToCollection(
        authedRequest(
          `/api/games/${userGameId}/collections/${collectionId}`,
          token,
          { method: "POST" },
        ),
        { params: Promise.resolve({ gameId: userGameId, collectionId }) },
      );
      expect(attached.status).toBe(204);
    }
    const userGame = await UserGame.findById(userGameId).lean();
    expect(userGame?.collectionIds.map(String)).toEqual([collectionId]);
  });
});

describe("ATP ignores the restrictive policy", () => {
  it("keeps legacy reuse with personal and conflictPolicy present", async () => {
    const token = await tokenFor();
    stubAtpFetch();
    const first = await neutralImport(
      authedRequest("/api/search/import", token, {
        method: "POST",
        body: {
          externalId: ATP_ID,
          personal: { status: "playing" },
          conflictPolicy: "reject-existing",
        },
      }),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(first.status).toBe(201);
    const firstSnapshotId = (await first.json()).data.game._id as string;
    await UserGame.deleteMany({});
    const second = await neutralImport(
      authedRequest("/api/search/import", token, {
        method: "POST",
        body: { externalId: ATP_ID, conflictPolicy: "reject-existing" },
      }),
      // @ts-expect-error Next 15 route context unused here
      {},
    );
    expect(second.status).toBe(201);
    // Legacy reuse: same GlobalGame snapshot, new UserGame.
    expect((await second.json()).data.game._id).toBe(firstSnapshotId);
  });
});

describe("follow-up wiring patterns", () => {
  it("validates the action through the IGDB endpoint", () => {
    const content = readFileSync(
      "features/atp/catalog-search.tsx",
      "utf8",
    );
    const handler = content.slice(
      content.indexOf("async function handleEditAndAdd"),
      content.indexOf("async function handleToggleBacklog"),
    );
    expect(handler).toContain("igdbDetailEndpoint(card.atpId)");
    expect(handler).not.toContain("searchDetailEndpoint");
  });

  it("retries only the attach after a completed import", () => {
    expect(
      hasPattern("features/games/game-form-container.tsx", [
        "createdUserGameId",
        "setCreatedUserGameId(userGameId)",
        "Jogo adicionado ao Backlog, mas a associação à coleção falhou",
      ]),
    ).toBe(true);
  });

  it("distinguishes load failure from loading on submit", () => {
    expect(
      hasPattern("features/games/game-form-container.tsx", [
        "externalFailed",
        "Não foi possível carregar os dados do catálogo. Volte à Busca Geral e tente novamente.",
      ]),
    ).toBe(true);
  });

  it("treats blank externalId as manual mode", () => {
    expect(
      hasPattern("features/games/game-form-container.tsx", [
        'initialExternalId.trim() !== ""',
        "normalizedExternalId",
      ]),
    ).toBe(true);
  });
});
