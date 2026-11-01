import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import {
  DELETE as deleteCollection,
  GET as getCollection,
  PATCH as patchCollection,
} from "@/app/api/game-collections/[collectionId]/route";
import {
  GET as listCollections,
  POST as createCollection,
} from "@/app/api/game-collections/route";
import { GameCollection } from "@/db/models/game-collection";
import { UserGame } from "@/db/models/user-game";
import {
  TEST_USER,
  clearDatabase,
  postRequest,
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

describe("POST /api/game-collections", () => {
  it("creates a list and returns 201 { data }", async () => {
    const token = await tokenFor();
    const response = await createCollection(
      authed("/api/game-collections", token, {
        method: "POST",
        body: { name: "  Favorites  " },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.name).toBe("Favorites");
    expect(typeof body.data._id).toBe("string");
  });

  it("rejects duplicate names with LIST_ALREADY_EXISTS", async () => {
    const token = await tokenFor();
    const payload = { method: "POST", body: { name: "Dupes" } } as const;
    expect((await createCollection(authed("/api/game-collections", token, payload))).status).toBe(201);
    const duplicate = await createCollection(authed("/api/game-collections", token, payload));
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error.code).toBe("LIST_ALREADY_EXISTS");
  });

  it("scopes duplicate names per user", async () => {
    const token = await tokenFor();
    await createCollection(authed("/api/game-collections", token, {
      method: "POST",
      body: { name: "Shared Name" },
    }));
    const otherToken = await tokenFor(OTHER_USER);
    const response = await createCollection(authed("/api/game-collections", otherToken, {
      method: "POST",
      body: { name: "Shared Name" },
    }));
    expect(response.status).toBe(201);
  });

  it("validates the name", async () => {
    const token = await tokenFor();
    const response = await createCollection(authed("/api/game-collections", token, {
      method: "POST",
      body: { name: "   " },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    const response = await createCollection(
      postRequest("/api/game-collections", { name: "Nope" }),
    );
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/game-collections/:collectionId", () => {
  it("renames the owned list", async () => {
    const token = await tokenFor();
    const created = await (
      await createCollection(authed("/api/game-collections", token, {
        method: "POST",
        body: { name: "Old" },
      }))
    ).json();
    const id = created.data._id as string;

    const response = await patchCollection(authed(`/api/game-collections/${id}`, token, {
      method: "PATCH",
      body: { name: "New" },
    }), { params: Promise.resolve({ collectionId: id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.name).toBe("New");
  });

  it("rejects renames colliding with a sibling list", async () => {
    const token = await tokenFor();
    const opts = { method: "POST", body: { name: "Taken" } } as const;
    await createCollection(authed("/api/game-collections", token, opts));
    const created = await (
      await createCollection(authed("/api/game-collections", token, {
        method: "POST",
        body: { name: "Free" },
      }))
    ).json();
    const response = await patchCollection(authed(`/api/game-collections/${created.data._id}`, token, {
      method: "PATCH",
      body: { name: "Taken" },
    }), { params: Promise.resolve({ collectionId: created.data._id }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("LIST_ALREADY_EXISTS");
  });

  it("rejects foreign lists with LIST_NOT_FOUND", async () => {
    const token = await tokenFor();
    const created = await (
      await createCollection(authed("/api/game-collections", token, {
        method: "POST",
        body: { name: "Mine" },
      }))
    ).json();
    const otherToken = await tokenFor(OTHER_USER);
    const response = await patchCollection(authed(`/api/game-collections/${created.data._id}`, otherToken, {
      method: "PATCH",
      body: { name: "Theft" },
    }), { params: Promise.resolve({ collectionId: created.data._id }) });
    expect(response.status).toBe(404);
  });

  it("reports malformed ids as INVALID_LIST_ID (no param pre-validation)", async () => {
    const token = await tokenFor();
    const response = await patchCollection(authed("/api/game-collections/nope", token, {
      method: "PATCH",
      body: { name: "Nope" },
    }), { params: Promise.resolve({ collectionId: "nope" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_LIST_ID");
  });
});

describe("DELETE /api/game-collections/:collectionId", () => {
  it("deletes the list, detaches it from games, preserves records", async () => {
    const token = await tokenFor();
    const created = await (
      await createCollection(authed("/api/game-collections", token, {
        method: "POST",
        body: { name: "Doomed" },
      }))
    ).json();
    const collectionId = created.data._id as string;

    const { POST: createGame } = await import("@/app/api/games/route");
    const game = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: { game: { name: "Tagged Game" } },
      }))
    ).json();
    const { POST: addToCollection } = await import(
      "@/app/api/games/[gameId]/collections/[collectionId]/route"
    );
    const addResponse = await addToCollection(
      authed(`/api/games/${game.data._id}/collections/${collectionId}`, token, {
        method: "POST",
      }),
      { params: Promise.resolve({ gameId: game.data._id, collectionId }) },
    );
    expect(addResponse.status).toBe(204);

    const response = await deleteCollection(authed(`/api/game-collections/${collectionId}`, token, {
      method: "DELETE",
    }), { params: Promise.resolve({ collectionId }) });
    expect(response.status).toBe(204);

    expect((await getCollection(authed(`/api/game-collections/${collectionId}`, token), {
      params: Promise.resolve({ collectionId }),
    })).status).toBe(404);
    // The game survives without the detached list id.
    const survivor = await UserGame.findById(game.data._id).lean();
    expect(survivor).not.toBeNull();
    expect(survivor?.collectionIds ?? []).toHaveLength(0);
    expect(
      (await listCollections(authed("/api/game-collections", token))).status,
    ).toBe(200);
  });

  it("validates the id param with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const response = await deleteCollection(authed("/api/game-collections/nope", token, {
      method: "DELETE",
    }), { params: Promise.resolve({ collectionId: "nope" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("leaves other users' lists alone", async () => {
    const token = await tokenFor();
    const created = await (
      await createCollection(authed("/api/game-collections", token, {
        method: "POST",
        body: { name: "Mine" },
      }))
    ).json();
    const otherToken = await tokenFor(OTHER_USER);
    const response = await deleteCollection(authed(`/api/game-collections/${created.data._id}`, otherToken, {
      method: "DELETE",
    }), { params: Promise.resolve({ collectionId: created.data._id }) });
    expect(response.status).toBe(404);
    expect(await GameCollection.countDocuments()).toBe(1);
  });
});
