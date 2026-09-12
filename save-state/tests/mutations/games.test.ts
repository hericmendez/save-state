import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import {
  DELETE as deleteGame,
  GET as getGame,
  PATCH as patchGame,
  PUT as putGame,
} from "@/app/api/games/[gameId]/route";
import { GlobalGame } from "@/db/models/global-game";
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

const MANUAL_GAME = {
  game: {
    name: "Hollow Knight",
    genres: ["Metroidvania"],
    platforms: ["PC"],
    developers: ["Team Cherry"],
    publishers: ["Team Cherry"],
  },
  status: "playing",
  hoursPlayed: 12,
};

describe("POST /api/games", () => {
  it("creates a manual game and returns 201 { data }", async () => {
    const token = await tokenFor();
    const response = await createGame(
      authed("/api/games", token, { method: "POST", body: MANUAL_GAME }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.status).toBe("playing");
    expect(body.data.hoursPlayed).toBe(12);
    expect(body.data.game.name).toBe("Hollow Knight");
    expect(body.data.game.source).toBe("manual");
    expect(typeof body.data.game.slug).toBe("string");
  });

  it("creates from an existing GlobalGame via gameId", async () => {
    const token = await tokenFor();
    const created = await createGame(
      authed("/api/games", token, { method: "POST", body: MANUAL_GAME }),
    );
    const globalId = (await created.json()).data.game._id;

    await register(postRequest("/api/auth/register", OTHER_USER));
    const otherToken = await tokenFor(OTHER_USER);
    const response = await createGame(
      authed("/api/games", otherToken, {
        method: "POST",
        body: { gameId: globalId, status: "backlog" },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.game._id).toBe(globalId);
    expect(await GlobalGame.countDocuments()).toBe(1);
  });

  it("rejects unknown gameId references with 400 GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const response = await createGame(
      authed("/api/games", token, {
        method: "POST",
        body: { gameId: "000000000000000000000000" },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("GAME_NOT_FOUND");
  });

  it("rejects empty payloads with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const response = await createGame(
      authed("/api/games", token, { method: "POST", body: {} }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate library entries with GAME_ALREADY_IN_LIBRARY", async () => {
    const token = await tokenFor();
    const payload = { method: "POST", body: MANUAL_GAME } as const;
    expect((await createGame(authed("/api/games", token, payload))).status).toBe(201);
    const duplicate = await createGame(authed("/api/games", token, payload));
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error.code).toBe("GAME_ALREADY_IN_LIBRARY");
    expect(await UserGame.countDocuments()).toBe(1);
  });

  it("requires authentication", async () => {
    const response = await createGame(
      postRequest("/api/games", MANUAL_GAME),
    );
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/games/:gameId", () => {
  it("updates personal fields without touching shared metadata", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const id = created.data._id as string;

    const response = await patchGame(authed(`/api/games/${id}`, token, {
      method: "PATCH",
      body: { rating: 9, status: "finished" },
    }), { params: Promise.resolve({ gameId: id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.rating).toBe(9);
    expect(body.data.status).toBe("finished");
    expect(body.data.game.name).toBe("Hollow Knight");
  });

  it("edits metadata of manual games", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const id = created.data._id as string;

    const response = await patchGame(authed(`/api/games/${id}`, token, {
      method: "PATCH",
      body: { game: { name: "Hollow Knight: Voidheart" } },
    }), { params: Promise.resolve({ gameId: id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.game.name).toBe(
      "Hollow Knight: Voidheart",
    );
  });

  it("rejects metadata edits on non-manual games", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const id = created.data._id as string;
    await GlobalGame.updateOne(
      { _id: created.data.game._id },
      { $set: { source: "atp" } },
    );

    const response = await patchGame(authed(`/api/games/${id}`, token, {
      method: "PATCH",
      body: { game: { name: "Changed" } },
    }), { params: Promise.resolve({ gameId: id }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("GAME_METADATA_IMMUTABLE");
  });

  it("clears nullable fields with explicit null", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: { ...MANUAL_GAME, rating: 7, review: "Great" },
      }))
    ).json();
    const id = created.data._id as string;

    const response = await patchGame(authed(`/api/games/${id}`, token, {
      method: "PATCH",
      body: { rating: null, review: null },
    }), { params: Promise.resolve({ gameId: id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.rating).toBeNull();
    expect(body.data.review).toBeNull();
  });

  it("rejects empty updates with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const id = created.data._id as string;
    const response = await patchGame(authed(`/api/games/${id}`, token, {
      method: "PATCH",
      body: {},
    }), { params: Promise.resolve({ gameId: id }) });
    expect(response.status).toBe(400);
  });

  it("rejects foreign games with GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const otherToken = await tokenFor(OTHER_USER);
    const response = await patchGame(authed(`/api/games/${created.data._id}`, otherToken, {
      method: "PATCH",
      body: { rating: 1 },
    }), { params: Promise.resolve({ gameId: created.data._id }) });
    expect(response.status).toBe(404);
  });

  it("reports malformed ids as INVALID_GAME_ID (no param pre-validation)", async () => {
    const token = await tokenFor();
    const response = await patchGame(authed("/api/games/nope", token, {
      method: "PATCH",
      body: { rating: 1 },
    }), { params: Promise.resolve({ gameId: "nope" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_GAME_ID");
  });
});

describe("PUT /api/games/:gameId", () => {
  it("behaves like PATCH through a separate handler", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const id = created.data._id as string;

    const response = await putGame(authed(`/api/games/${id}`, token, {
      method: "PUT",
      body: { status: "finished", hoursPlayed: 30 },
    }), { params: Promise.resolve({ gameId: id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("finished");
    expect(body.data.hoursPlayed).toBe(30);
  });
});

describe("DELETE /api/games/:gameId", () => {
  it("deletes the UserGame, preserves GlobalGame, returns 204", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const id = created.data._id as string;
    const globalId = created.data.game._id as string;

    const response = await deleteGame(authed(`/api/games/${id}`, token, {
      method: "DELETE",
    }), { params: Promise.resolve({ gameId: id }) });
    expect(response.status).toBe(204);

    expect(
      (await getGame(authed(`/api/games/${id}`, token), {
        params: Promise.resolve({ gameId: id }),
      })).status,
    ).toBe(404);
    expect(await GlobalGame.findById(globalId)).not.toBeNull();
    expect(await UserGame.countDocuments()).toBe(0);
  });

  it("rejects foreign deletes with GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const created = await (
      await createGame(authed("/api/games", token, {
        method: "POST",
        body: MANUAL_GAME,
      }))
    ).json();
    const otherToken = await tokenFor(OTHER_USER);
    const response = await deleteGame(authed(`/api/games/${created.data._id}`, otherToken, {
      method: "DELETE",
    }), { params: Promise.resolve({ gameId: created.data._id }) });
    expect(response.status).toBe(404);
    expect(await UserGame.countDocuments()).toBe(1);
  });

  it("validates the id param with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const response = await deleteGame(authed("/api/games/nope", token, {
      method: "DELETE",
    }), { params: Promise.resolve({ gameId: "nope" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
