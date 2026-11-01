/**
 * Fase 9B — export API coverage gap: the routes had real UI usage
 * (settings export buttons) but no dedicated tests.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as exportJson } from "@/app/api/auth/export/route";
import { GET as exportCsv } from "@/app/api/auth/export/csv/route";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers";

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

function authed(path: string, token: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: `token=${token}` },
  });
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

describe("GET /api/auth/export", () => {
  it("requires authentication", async () => {
    const response = await exportJson(
      new NextRequest("http://localhost/api/auth/export"),
    );
    expect(response.status).toBe(401);
  });

  it("returns the caller payload as a JSON attachment", async () => {
    const token = await tokenFor();
    const response = await exportJson(authed("/api/auth/export", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain(
      "attachment",
    );
    const body = await response.json();
    expect(body.user.email).toBe(TEST_USER.email);
    expect(typeof body.exportedAt).toBe("string");
    expect(Array.isArray(body.games)).toBe(true);
    expect(Array.isArray(body.collections)).toBe(true);
  });

  it("exports collections with collectionIds (new format)", async () => {
    const token = await tokenFor();
    const authedPost = (path: string, body: unknown) =>
      new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `token=${token}`,
        },
        body: JSON.stringify(body),
      });
    const { POST: createGame } = await import("@/app/api/games/route");
    const gameId = (
      (await (
        await createGame(authedPost("/api/games", { game: { name: "Export Me" } }))
      ).json()) as { data: { _id: string } }
    ).data._id;
    const { POST: createCollection } = await import(
      "@/app/api/game-collections/route"
    );
    const created = await createCollection(
      authedPost("/api/game-collections", { name: "Exportados" }),
    );
    expect(created.status).toBe(201);
    const collectionId = ((await created.json()) as { data: { _id: string } }).data._id;
    const { POST: attach } = await import(
      "@/app/api/games/[gameId]/collections/[collectionId]/route"
    );
    const attached = await attach(
      authedPost(
        `/api/games/${gameId}/collections/${collectionId}`,
        {},
      ),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    expect(attached.status).toBe(204);

    const response = await exportJson(authed("/api/auth/export", token));
    const body = await response.json();
    expect(body.collections).toEqual([{ id: collectionId, name: "Exportados" }]);
    expect(body.games).toHaveLength(1);
    expect(body.games[0].collectionIds).toEqual([collectionId]);
    expect(body.games[0]).not.toHaveProperty("listIds");
  });
});

describe("GET /api/auth/export/csv", () => {
  it("requires authentication", async () => {
    const response = await exportCsv(
      new NextRequest("http://localhost/api/auth/export/csv"),
    );
    expect(response.status).toBe(401);
  });

  it("returns CSV with the expected content type", async () => {
    const token = await tokenFor();
    const response = await exportCsv(authed("/api/auth/export/csv", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    const text = await response.text();
    expect(text.split("\n")[0]).toContain("userId");
    expect(text.split("\n")[0]).toContain("collectionIds");
    expect(text.split("\n")[0]).not.toContain("listIds");
  });
});
