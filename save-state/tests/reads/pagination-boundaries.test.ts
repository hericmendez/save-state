import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listGamesRoute } from "@/app/api/games/route";
import { signToken } from "@/server/auth/session";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";
import { seedReadFixtures, type SeedResult } from "./seed";

let seed: SeedResult;

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  seed = await seedReadFixtures();
});

function authedGet(path: string): NextRequest {
  const token = signToken({ userId: seed.userAId, sessionVersion: 0 });
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `token=${token}` },
  });
}

describe("pagination boundaries", () => {
  it("returns an empty page beyond the total with a correct envelope", async () => {
    const response = await listGamesRoute(authedGet("/api/games?page=99&limit=20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      pagination: {
        page: 99,
        limit: 20,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it("rejects limits above the maximum with INVALID_QUERY", async () => {
    const response = await listGamesRoute(authedGet("/api/games?limit=101"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });

  it("rejects non-numeric pagination with INVALID_QUERY", async () => {
    const response = await listGamesRoute(authedGet("/api/games?page=abc"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_QUERY");
  });

  it("accepts the maximum limit", async () => {
    const response = await listGamesRoute(authedGet("/api/games?limit=100"));
    expect(response.status).toBe(200);
    expect((await response.json()).pagination).toMatchObject({
      limit: 100,
      total: 2,
      totalPages: 1,
    });
  });

  it("returns the exact empty-collection envelope", async () => {
    const { UserGame } = await import("@/db/models/user-game");
    await UserGame.deleteMany({ userId: seed.userAId });
    const token = signToken({ userId: seed.userAId, sessionVersion: 0 });
    const request = new NextRequest("http://localhost/api/games", {
      headers: { cookie: `token=${token}` },
    });
    const response = await listGamesRoute(request);
    expect(await response.json()).toEqual({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });
});
