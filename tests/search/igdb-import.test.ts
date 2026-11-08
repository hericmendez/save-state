import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as neutralImport } from "@/app/api/search/import/route";
import { GET as byExternal } from "@/app/api/games/by-external/[externalId]/route";
import { GET as neutralDetail } from "@/app/api/search/games/[id]/route";
import { searchCatalogPage } from "@/server/search/catalog-reads";
import { __resetServerEnvCache } from "@/lib/env";
import { __resetTwitchTokenCache } from "@/server/search/twitch-token";
import { __resetIgdbThrottle } from "@/server/search/igdb-client";
import { __resetIgdbFilterCaches } from "@/server/search/igdb-provider";
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

const IGDB_SOURCE = {
  SEARCH_METHOD: "IGDB",
  TWITCH_CLIENT_ID: "cid",
  TWITCH_CLIENT_SECRET: "secret",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FULL_GAME = {
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

const BARE_GAME = {
  id: 777,
  name: "Untitled Prototype",
  game_type: 0,
};

let gamePayload: Record<string, unknown> = FULL_GAME;

function stubIgdbFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 });
      }
      const body = String(init?.body ?? "");
      if (url.endsWith("/games/count")) return jsonResponse({ count: 1 });
      if (url.endsWith("/games")) {
        if (body.includes("where id = 404")) return jsonResponse([]);
        if (body.includes("where id = 777")) return jsonResponse([BARE_GAME]);
        return jsonResponse([gamePayload]);
      }
      if (url.endsWith("/involved_companies")) return jsonResponse([]);
      if (url.endsWith("/companies")) return jsonResponse([]);
      if (url.endsWith("/genres")) return jsonResponse([]);
      throw new Error(`unexpected IGDB call: ${url}`);
    }),
  );
}

beforeAll(async () => {
  await startTestDatabase();
});
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  gamePayload = FULL_GAME;
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  __resetIgdbThrottle();
  __resetIgdbFilterCaches();
  Object.assign(process.env, IGDB_SOURCE);
});
afterEach(() => {
  vi.unstubAllGlobals();
  __resetServerEnvCache();
  __resetTwitchTokenCache();
  delete process.env.SEARCH_METHOD;
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
});

async function tokenFor(email: string = TEST_USER.email, password: string = TEST_USER.password, name: string = TEST_USER.name): Promise<string> {
  await register(postRequest("/api/auth/register", { name, email, password }));
  const response = await login(postRequest("/api/auth/login", { email, password }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return token;
}

async function importBody(token: string, body: unknown) {
  const response = await neutralImport(
    authedRequest("/api/search/import", token, { method: "POST", body }),
  );
  return { status: response.status, body: await response.json() };
}

describe("Etapa 4 — IGDB import creates GlobalGame + UserGame", () => {
  it("creates a source-igdb snapshot with normalized metadata", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const { status, body } = await importBody(token, { externalId: "1234" });
    expect(status).toBe(201);
    expect(body.data.game).toMatchObject({
      source: "igdb",
      igdbId: 1234,
      name: "Chrono Trigger",
      genres: ["Role-playing (RPG)"],
      platforms: ["Super Nintendo Entertainment System"],
      cover: expect.stringContaining("images.igdb.com"),
      summary: "A time-travel RPG.",
    });
    expect(body.data.game).not.toHaveProperty("atpDomainId");
    const stored = await GlobalGame.findOne({ igdbId: 1234 }).lean();
    expect(stored?.source).toBe("igdb");
    // Only one UserGame links the importer to the new GlobalGame.
    expect(await UserGame.countDocuments({})).toBe(1);
  });

  it("handles incomplete metadata without failing or inventing values", async () => {
    gamePayload = BARE_GAME;
    const token = await tokenFor();
    stubIgdbFetch();
    const { status, body } = await importBody(token, { externalId: "777" });
    expect(status).toBe(201);
    expect(body.data.game).toMatchObject({
      source: "igdb",
      igdbId: 777,
      genres: [],
      platforms: [],
      developers: [],
      publishers: [],
    });
    expect(body.data.game.cover).toBeUndefined();
    expect(body.data.game.releaseDate).toBeUndefined();
    expect(body.data.game.summary).toBeUndefined();
  });

  it("reuses the snapshot on repeat import (no duplicate GlobalGame)", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const first = await importBody(token, { externalId: "1234" });
    expect(first.status).toBe(201);
    const second = await importBody(token, { externalId: "1234" });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("GAME_ALREADY_IN_LIBRARY");
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
    expect(await UserGame.countDocuments({})).toBe(1);
  });

  it("shares one GlobalGame across different users without duplication", async () => {
    const tokenA = await tokenFor("a@test.com", "password-123", "User A");
    const tokenB = await tokenFor("b@test.com", "password-123", "User B");
    stubIgdbFetch();
    const [a, b] = await Promise.all([
      importBody(tokenA, { externalId: "1234" }),
      importBody(tokenB, { externalId: "1234" }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await GlobalGame.countDocuments({ igdbId: 1234 })).toBe(1);
    expect(await UserGame.countDocuments({})).toBe(2);
  });

  it("propagates detail failures with no partial writes", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const { status, body } = await importBody(token, { externalId: "404" });
    expect(status).toBe(404);
    expect(body.error.code).toBe("IGDB_GAME_NOT_FOUND");
    expect(await GlobalGame.countDocuments({})).toBe(0);
    expect(await UserGame.countDocuments({})).toBe(0);
  });

  it("rejects ATP-shaped ids (never misinterpreted as IGDB)", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const { status, body } = await importBody(token, { externalId: "atp-wikipedia-1" });
    expect(status).toBe(404);
    expect(body.error.code).toBe("IGDB_GAME_NOT_FOUND");
    expect(await GlobalGame.countDocuments({})).toBe(0);
  });

  it("does not merge a manual record with the same name", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    await GlobalGame.create({ slug: "chrono-trigger-manual", name: "Chrono Trigger", source: "manual" });
    const { status } = await importBody(token, { externalId: "1234" });
    expect(status).toBe(201);
    expect(await GlobalGame.countDocuments({ name: "Chrono Trigger" })).toBe(2);
    const igdb = await GlobalGame.findOne({ igdbId: 1234 }).lean();
    expect(igdb?.source).toBe("igdb");
  });

  it("preserves pre-existing ATP records untouched", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    await GlobalGame.create({
      slug: "chrono-trigger-atp",
      name: "Chrono Trigger",
      source: "atp",
      atpDomainId: "atp-wikipedia-6509467",
    });
    const { status } = await importBody(token, { externalId: "1234" });
    expect(status).toBe(201);
    const atp = await GlobalGame.findOne({ atpDomainId: "atp-wikipedia-6509467" }).lean();
    expect(atp?.source).toBe("atp");
    expect(atp?.igdbId).toBeUndefined();
  });
});

describe("Etapa 4 — IGDB ownership and library bridge", () => {
  it("marks owned cards for the importer only", async () => {
    const tokenA = await tokenFor("a@test.com", "password-123", "User A");
    const tokenB = await tokenFor("b@test.com", "password-123", "User B");
    stubIgdbFetch();
    await importBody(tokenA, { externalId: "1234" });

    // Ownership is verified through the neutral search reads with each
    // user's id looked up directly by email.
    const { User } = await import("@/db/models/user");
    const userA = await User.findOne({ email: "a@test.com" }).lean();
    const userB = await User.findOne({ email: "b@test.com" }).lean();
    const idA = String(userA?._id);
    const idB = String(userB?._id);
    const source = { ...process.env } as Record<string, string | undefined>;
    const pageA = await searchCatalogPage({ q: "chrono", page: 1, limit: 20 }, idA, source);
    const pageB = await searchCatalogPage({ q: "chrono", page: 1, limit: 20 }, idB, source);
    expect(pageA.data[0]).toMatchObject({ id: "1234", owned: true });
    expect(pageB.data[0]).toMatchObject({ id: "1234", owned: false });
  });

  it("resolves the owned game through the neutral by-external bridge", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    await importBody(token, { externalId: "1234" });
    const response = await byExternal(authedRequest("/api/games/by-external/1234", token), {
      params: Promise.resolve({ externalId: "1234" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.game).toMatchObject({ igdbId: 1234, source: "igdb" });
  });

  it("returns 404 from the bridge for unowned or unknown ids", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    const missing = await byExternal(authedRequest("/api/games/by-external/1234", token), {
      params: Promise.resolve({ externalId: "1234" }),
    });
    expect(missing.status).toBe(404);
  });

  it("shows owned state on neutral detail after import", async () => {
    const token = await tokenFor();
    stubIgdbFetch();
    await importBody(token, { externalId: "1234" });
    const response = await neutralDetail(authedRequest("/api/search/games/1234", token), {
      params: Promise.resolve({ id: "1234" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ id: "1234", owned: true });
  });
});
