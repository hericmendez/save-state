import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import {
  DELETE as removeFromCollection,
  POST as addToCollection,
} from "@/app/api/games/[gameId]/collections/[collectionId]/route";
import { POST as createCollection } from "@/app/api/game-collections/route";
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

const OTHER_USER = {
  name: "Other User",
  email: "other@test.com",
  password: "password-123",
};

async function tokenFor(user: { name: string; email: string; password: string } = TEST_USER): Promise<string> {
  await register(postRequest("/api/auth/register", user));
  await markTestUserVerified(user.email);
  const response = await login(postRequest("/api/auth/login", {
    email: user.email,
    password: user.password,
  }));
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

async function gameAndCollection(token: string): Promise<{ gameId: string; collectionId: string }> {
  const game = await (
    await createGame(authed("/api/games", token, {
      method: "POST",
      body: { game: { name: "Membership Game" } },
    }))
  ).json();
  const list = await (
    await createCollection(authed("/api/game-collections", token, {
      method: "POST",
      body: { name: "Membership List" },
    }))
  ).json();
  return { gameId: game.data._id as string, collectionId: list.data._id as string };
}

describe("POST /api/games/:gameId/collections/:collectionId", () => {
  it("attaches the list and returns 204", async () => {
    const token = await tokenFor();
    const { gameId, collectionId } = await gameAndCollection(token);
    const response = await addToCollection(
      authed(`/api/games/${gameId}/collections/${collectionId}`, token, { method: "POST" }),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    expect(response.status).toBe(204);
    const stored = await UserGame.findById(gameId).lean();
    expect((stored?.collectionIds ?? []).map(String)).toContain(collectionId);
  });

  it("is idempotent for duplicate membership", async () => {
    const token = await tokenFor();
    const { gameId, collectionId } = await gameAndCollection(token);
    const path = `/api/games/${gameId}/collections/${collectionId}`;
    expect(
      (await addToCollection(authed(path, token, { method: "POST" }), {
        params: Promise.resolve({ gameId, collectionId }),
      })).status,
    ).toBe(204);
    expect(
      (await addToCollection(authed(path, token, { method: "POST" }), {
        params: Promise.resolve({ gameId, collectionId }),
      })).status,
    ).toBe(204);
    const stored = await UserGame.findById(gameId).lean();
    expect(stored?.collectionIds ?? []).toHaveLength(1);
  });

  it("rejects foreign games and lists with GAME/LIST_NOT_FOUND", async () => {
    const token = await tokenFor();
    const { gameId, collectionId } = await gameAndCollection(token);
    const otherToken = await tokenFor(OTHER_USER);

    const foreignGame = await addToCollection(
      authed(`/api/games/${gameId}/collections/${collectionId}`, otherToken, { method: "POST" }),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    // The list is verified before the game, so a fully foreign pair
    // surfaces as LIST_NOT_FOUND.
    expect(foreignGame.status).toBe(404);
    expect((await foreignGame.json()).error.code).toBe("LIST_NOT_FOUND");

    const { gameId: otherGame } = await gameAndCollection(otherToken);
    const foreignList = await addToCollection(
      authed(`/api/games/${otherGame}/collections/${collectionId}`, otherToken, { method: "POST" }),
      { params: Promise.resolve({ gameId: otherGame, collectionId }) },
    );
    expect(foreignList.status).toBe(404);
    expect((await foreignList.json()).error.code).toBe("LIST_NOT_FOUND");
  });

  it("validates params with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const response = await addToCollection(
      authed("/api/games/nope/collections/nope", token, { method: "POST" }),
      { params: Promise.resolve({ gameId: "nope", collectionId: "nope" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    const token = await tokenFor();
    const { gameId, collectionId } = await gameAndCollection(token);
    const response = await addToCollection(
      new NextRequest(`http://localhost/api/games/${gameId}/collections/${collectionId}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/games/:gameId/collections/:collectionId", () => {
  it("detaches the list and returns 204", async () => {
    const token = await tokenFor();
    const { gameId, collectionId } = await gameAndCollection(token);
    const path = `/api/games/${gameId}/collections/${collectionId}`;
    await addToCollection(authed(path, token, { method: "POST" }), {
      params: Promise.resolve({ gameId, collectionId }),
    });
    const response = await removeFromCollection(
      authed(path, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    expect(response.status).toBe(204);
    const stored = await UserGame.findById(gameId).lean();
    expect(stored?.collectionIds ?? []).toHaveLength(0);
  });

  it("is idempotent when the membership is absent", async () => {
    const token = await tokenFor();
    const { gameId, collectionId } = await gameAndCollection(token);
    const response = await removeFromCollection(
      authed(`/api/games/${gameId}/collections/${collectionId}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    expect(response.status).toBe(204);
  });

  it("rejects foreign games with GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const { gameId, collectionId } = await gameAndCollection(token);
    const otherToken = await tokenFor(OTHER_USER);
    const response = await removeFromCollection(
      authed(`/api/games/${gameId}/collections/${collectionId}`, otherToken, { method: "DELETE" }),
      { params: Promise.resolve({ gameId, collectionId }) },
    );
    expect(response.status).toBe(404);
  });
});
