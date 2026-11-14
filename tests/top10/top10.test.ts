import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import {
  DELETE as deleteGame,
  PATCH as patchGame,
} from "@/app/api/games/[gameId]/route";
import {
  DELETE as removeTop10,
  POST as addTop10,
} from "@/app/api/top10/[userGameId]/route";
import { GET as getTop10, PATCH as reorderTop10 } from "@/app/api/top10/route";
import { User } from "@/db/models/user";
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

async function tokenFor(
  user: { name: string; email: string; password: string } = TEST_USER,
): Promise<string> {
  await register(postRequest("/api/auth/register", user));
  await markTestUserVerified(user.email);
  const response = await login(
    postRequest("/api/auth/login", {
      email: user.email,
      password: user.password,
    }),
  );
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

async function createUserGame(
  token: string,
  name: string,
  favorite = true,
): Promise<string> {
  const response = await createGame(
    authed("/api/games", token, {
      method: "POST",
      body: { game: { name }, favorite },
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()).data._id as string);
}

function top10Params(id: string) {
  return { params: Promise.resolve({ userGameId: id }) };
}

describe("POST /api/top10/:userGameId", () => {
  it("adds a favorite userGame to the end of the list", async () => {
    const token = await tokenFor();
    const first = await createUserGame(token, "Game A");
    const second = await createUserGame(token, "Game B");

    expect(
      (await addTop10(authed(`/api/top10/${first}`, token, { method: "POST" }), top10Params(first))).status,
    ).toBe(201);
    const response = await addTop10(
      authed(`/api/top10/${second}`, token, { method: "POST" }),
      top10Params(second),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.map((g: { _id: string }) => g._id)).toEqual([first, second]);
  });

  it("rejects nonexistent userGames with GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const missing = "000000000000000000000000";
    const response = await addTop10(
      authed(`/api/top10/${missing}`, token, { method: "POST" }),
      top10Params(missing),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("GAME_NOT_FOUND");
  });

  it("rejects malformed ids with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const response = await addTop10(
      authed("/api/top10/nope", token, { method: "POST" }),
      top10Params("nope"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-favorite games with TOP10_NOT_FAVORITE", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Not Fav", false);
    const response = await addTop10(
      authed(`/api/top10/${id}`, token, { method: "POST" }),
      top10Params(id),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("TOP10_NOT_FAVORITE");
  });

  it("rejects another user's game with GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Mine");
    const otherToken = await tokenFor(OTHER_USER);
    const response = await addTop10(
      authed(`/api/top10/${id}`, otherToken, { method: "POST" }),
      top10Params(id),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("GAME_NOT_FOUND");
  });

  it("rejects duplicates with TOP10_DUPLICATE", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Dup");
    expect(
      (await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id))).status,
    ).toBe(201);
    const duplicate = await addTop10(
      authed(`/api/top10/${id}`, token, { method: "POST" }),
      top10Params(id),
    );
    expect(duplicate.status).toBe(400);
    expect((await duplicate.json()).error.code).toBe("TOP10_DUPLICATE");
  });

  it("rejects the 11th item with TOP10_FULL", async () => {
    const token = await tokenFor();
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      ids.push(await createUserGame(token, `Top ${i}`));
    }
    for (const id of ids) {
      expect(
        (await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id))).status,
      ).toBe(201);
    }
    const eleventh = await createUserGame(token, "Eleventh");
    const response = await addTop10(
      authed(`/api/top10/${eleventh}`, token, { method: "POST" }),
      top10Params(eleventh),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("TOP10_FULL");
  });

  it("requires authentication", async () => {
    const response = await addTop10(
      postRequest("/api/top10/000000000000000000000000", {}),
      top10Params("000000000000000000000000"),
    );
    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/top10/:userGameId", () => {
  it("removes an existing item without deleting the userGame", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Ranked");
    await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id));

    const response = await removeTop10(
      authed(`/api/top10/${id}`, token, { method: "DELETE" }),
      top10Params(id),
    );
    expect(response.status).toBe(204);
    expect(await UserGame.findById(id)).not.toBeNull();

    const listed = await (await getTop10(authed("/api/top10", token))).json();
    expect(listed.data).toEqual([]);
  });

  it("is idempotent for items not in the list", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Never Ranked");
    const response = await removeTop10(
      authed(`/api/top10/${id}`, token, { method: "DELETE" }),
      top10Params(id),
    );
    expect(response.status).toBe(204);
  });
});

describe("PATCH /api/top10", () => {
  it("persists a valid reorder", async () => {
    const token = await tokenFor();
    const ids = [
      await createUserGame(token, "A"),
      await createUserGame(token, "B"),
      await createUserGame(token, "C"),
    ];
    for (const id of ids) {
      await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id));
    }
    const reversed = [...ids].reverse();
    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: reversed } }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.map((g: { _id: string }) => g._id)).toEqual(reversed);
  });

  it("persists an empty reorder", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Solo");
    await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id));
    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: [] } }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });

  it("treats a subset payload as the new full list", async () => {
    const token = await tokenFor();
    const ids = [
      await createUserGame(token, "A"),
      await createUserGame(token, "B"),
      await createUserGame(token, "C"),
    ];
    for (const id of ids) {
      await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id));
    }
    const subset = [ids[2], ids[0]];
    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: subset } }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.map((g: { _id: string }) => g._id)).toEqual(subset);
  });

  it("rejects unknown ids with GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const response = await reorderTop10(
      authed("/api/top10", token, {
        method: "PATCH",
        body: { top10: ["000000000000000000000000"] },
      }),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("GAME_NOT_FOUND");
  });

  it("rejects malformed ids with VALIDATION_ERROR", async () => {
    // Route-level Zod validation runs before the service: malformed ids
    // never reach the reorder logic.
    const token = await tokenFor();
    const response = await reorderTop10(
      authed("/api/top10", token, {
        method: "PATCH",
        body: { top10: ["nope"] },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicates with TOP10_DUPLICATE", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Dup");
    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: [id, id] } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("TOP10_DUPLICATE");
  });

  it("rejects another user's games with GAME_NOT_FOUND", async () => {
    const token = await tokenFor();
    const mine = await createUserGame(token, "Mine");
    const otherToken = await tokenFor(OTHER_USER);
    const response = await reorderTop10(
      authed("/api/top10", otherToken, { method: "PATCH", body: { top10: [mine] } }),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("GAME_NOT_FOUND");
  });

  it("rejects non-favorites with TOP10_NOT_FAVORITE", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Not Fav", false);
    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: [id] } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("TOP10_NOT_FAVORITE");
  });

  it("rejects more than 10 items", async () => {
    const token = await tokenFor();
    const ids: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      ids.push(await createUserGame(token, `Overflow ${i}`));
    }
    const response = await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: ids } }),
    );
    expect(response.status).toBe(400);
  });
});

describe("Top 10 integrity", () => {
  it("removes the reference when a game is unfavorited", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Was Fav");
    await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id));

    const patch = await patchGame(
      authed(`/api/games/${id}`, token, { method: "PATCH", body: { favorite: false } }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(patch.status).toBe(200);

    const listed = await (await getTop10(authed("/api/top10", token))).json();
    expect(listed.data).toEqual([]);
    expect(await UserGame.findById(id)).not.toBeNull();
  });

  it("removes the reference when the userGame is deleted", async () => {
    const token = await tokenFor();
    const id = await createUserGame(token, "Doomed");
    await addTop10(authed(`/api/top10/${id}`, token, { method: "POST" }), top10Params(id));

    const deleted = await deleteGame(
      authed(`/api/games/${id}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId: id }) },
    );
    expect(deleted.status).toBe(204);

    const listed = await (await getTop10(authed("/api/top10", token))).json();
    expect(listed.data).toEqual([]);
  });
});

describe("Top 10 persistence and reads", () => {
  it("starts empty, returns order, and survives reload", async () => {
    const token = await tokenFor();
    const empty = await (await getTop10(authed("/api/top10", token))).json();
    expect(empty.data).toEqual([]);

    const ids = [
      await createUserGame(token, "First"),
      await createUserGame(token, "Second"),
      await createUserGame(token, "Third"),
    ];
    await reorderTop10(
      authed("/api/top10", token, { method: "PATCH", body: { top10: ids } }),
    );

    const firstRead = await (await getTop10(authed("/api/top10", token))).json();
    expect(firstRead.data.map((g: { _id: string }) => g._id)).toEqual(ids);

    const secondRead = await (await getTop10(authed("/api/top10", token))).json();
    expect(secondRead.data.map((g: { _id: string }) => g._id)).toEqual(ids);

    const raw = await User.findOne({}).lean();
    expect((raw?.top10 ?? []).map(String)).toEqual(ids);
  });

  it("keeps Top 10 isolated per user", async () => {
    const token = await tokenFor();
    const mine = await createUserGame(token, "Mine");
    await addTop10(authed(`/api/top10/${mine}`, token, { method: "POST" }), top10Params(mine));

    const otherToken = await tokenFor(OTHER_USER);
    const otherList = await (await getTop10(authed("/api/top10", otherToken))).json();
    expect(otherList.data).toEqual([]);
  });
});
