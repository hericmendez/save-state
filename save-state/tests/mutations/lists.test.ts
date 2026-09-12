import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import {
  DELETE as deleteList,
  GET as getList,
  PATCH as patchList,
} from "@/app/api/game-lists/[listId]/route";
import {
  GET as listLists,
  POST as createList,
} from "@/app/api/game-lists/route";
import { GameList } from "@/db/models/game-list";
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

describe("POST /api/game-lists", () => {
  it("creates a list and returns 201 { data }", async () => {
    const token = await tokenFor();
    const response = await createList(
      authed("/api/game-lists", token, {
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
    expect((await createList(authed("/api/game-lists", token, payload))).status).toBe(201);
    const duplicate = await createList(authed("/api/game-lists", token, payload));
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error.code).toBe("LIST_ALREADY_EXISTS");
  });

  it("scopes duplicate names per user", async () => {
    const token = await tokenFor();
    await createList(authed("/api/game-lists", token, {
      method: "POST",
      body: { name: "Shared Name" },
    }));
    const otherToken = await tokenFor(OTHER_USER);
    const response = await createList(authed("/api/game-lists", otherToken, {
      method: "POST",
      body: { name: "Shared Name" },
    }));
    expect(response.status).toBe(201);
  });

  it("validates the name", async () => {
    const token = await tokenFor();
    const response = await createList(authed("/api/game-lists", token, {
      method: "POST",
      body: { name: "   " },
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication", async () => {
    const response = await createList(
      postRequest("/api/game-lists", { name: "Nope" }),
    );
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/game-lists/:listId", () => {
  it("renames the owned list", async () => {
    const token = await tokenFor();
    const created = await (
      await createList(authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Old" },
      }))
    ).json();
    const id = created.data._id as string;

    const response = await patchList(authed(`/api/game-lists/${id}`, token, {
      method: "PATCH",
      body: { name: "New" },
    }), { params: Promise.resolve({ listId: id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.name).toBe("New");
  });

  it("rejects renames colliding with a sibling list", async () => {
    const token = await tokenFor();
    const opts = { method: "POST", body: { name: "Taken" } } as const;
    await createList(authed("/api/game-lists", token, opts));
    const created = await (
      await createList(authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Free" },
      }))
    ).json();
    const response = await patchList(authed(`/api/game-lists/${created.data._id}`, token, {
      method: "PATCH",
      body: { name: "Taken" },
    }), { params: Promise.resolve({ listId: created.data._id }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("LIST_ALREADY_EXISTS");
  });

  it("rejects foreign lists with LIST_NOT_FOUND", async () => {
    const token = await tokenFor();
    const created = await (
      await createList(authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Mine" },
      }))
    ).json();
    const otherToken = await tokenFor(OTHER_USER);
    const response = await patchList(authed(`/api/game-lists/${created.data._id}`, otherToken, {
      method: "PATCH",
      body: { name: "Theft" },
    }), { params: Promise.resolve({ listId: created.data._id }) });
    expect(response.status).toBe(404);
  });

  it("reports malformed ids as INVALID_LIST_ID (no param pre-validation)", async () => {
    const token = await tokenFor();
    const response = await patchList(authed("/api/game-lists/nope", token, {
      method: "PATCH",
      body: { name: "Nope" },
    }), { params: Promise.resolve({ listId: "nope" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_LIST_ID");
  });
});

describe("DELETE /api/game-lists/:listId", () => {
  it("deletes the list, detaches it from games, preserves records", async () => {
    const token = await tokenFor();
    const created = await (
      await createList(authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Doomed" },
      }))
    ).json();
    const listId = created.data._id as string;

    const { POST: createGame } = await import("@/app/api/games/route");
    const game = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: { game: { name: "Tagged Game" } },
      }))
    ).json();
    const { POST: addToList } = await import(
      "@/app/api/games/[gameId]/lists/[listId]/route"
    );
    const addResponse = await addToList(
      authed(`/api/games/${game.data._id}/lists/${listId}`, token, {
        method: "POST",
      }),
      { params: Promise.resolve({ gameId: game.data._id, listId }) },
    );
    expect(addResponse.status).toBe(204);

    const response = await deleteList(authed(`/api/game-lists/${listId}`, token, {
      method: "DELETE",
    }), { params: Promise.resolve({ listId }) });
    expect(response.status).toBe(204);

    expect((await getList(authed(`/api/game-lists/${listId}`, token), {
      params: Promise.resolve({ listId }),
    })).status).toBe(404);
    // The game survives without the detached list id.
    const survivor = await UserGame.findById(game.data._id).lean();
    expect(survivor).not.toBeNull();
    expect(survivor?.listIds ?? []).toHaveLength(0);
    expect(
      (await listLists(authed("/api/game-lists", token))).status,
    ).toBe(200);
  });

  it("validates the id param with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const response = await deleteList(authed("/api/game-lists/nope", token, {
      method: "DELETE",
    }), { params: Promise.resolve({ listId: "nope" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("leaves other users' lists alone", async () => {
    const token = await tokenFor();
    const created = await (
      await createList(authed("/api/game-lists", token, {
        method: "POST",
        body: { name: "Mine" },
      }))
    ).json();
    const otherToken = await tokenFor(OTHER_USER);
    const response = await deleteList(authed(`/api/game-lists/${created.data._id}`, otherToken, {
      method: "DELETE",
    }), { params: Promise.resolve({ listId: created.data._id }) });
    expect(response.status).toBe(404);
    expect(await GameList.countDocuments()).toBe(1);
  });
});
