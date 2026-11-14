import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import { DELETE as deleteUserGame } from "@/app/api/games/[gameId]/route";
import {
  GET as listNotes,
  POST as createNote,
} from "@/app/api/games/[gameId]/notes/route";
import {
  DELETE as deleteNote,
  PATCH as patchNote,
} from "@/app/api/games/[gameId]/notes/[noteId]/route";
import { Activity } from "@/db/models/activity";
import { GlobalGame } from "@/db/models/global-game";
import { UserGameNote } from "@/db/models/user-game-note";
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

let gameCounter = 0;

async function createUserGameId(token: string): Promise<string> {
  gameCounter += 1;
  const response = await createGame(
    authed("/api/games", token, {
      method: "POST",
      body: { game: { name: `Hollow Knight ${gameCounter}` }, status: "playing" },
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()).data._id as string);
}

const gameParams = (gameId: string) => ({
  params: Promise.resolve({ gameId }),
});

const noteParams = (gameId: string, noteId: string) => ({
  params: Promise.resolve({ gameId, noteId }),
});

describe("POST /api/games/:userGameId/notes", () => {
  it("creates a note and returns 201 { data }", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const response = await createNote(
      authed(`/api/games/${gameId}/notes`, token, {
        method: "POST",
        body: { content: "  Remember the mantis lords  " },
      }),
      gameParams(gameId),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.content).toBe("Remember the mantis lords");
    expect(typeof body.data._id).toBe("string");
    expect(body.data.createdAt).toBeDefined();
    expect(body.data.updatedAt).toBeDefined();
  });

  it("supports multiple notes per userGame in creation order", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    for (const content of ["First", "Second", "Third"]) {
      const response = await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content },
        }),
        gameParams(gameId),
      );
      expect(response.status).toBe(201);
    }
    expect(await UserGameNote.countDocuments()).toBe(3);
  });

  it("rejects empty and whitespace-only content with VALIDATION_ERROR", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    for (const content of ["", "   ", "\n\t "]) {
      const response = await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content },
        }),
        gameParams(gameId),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects content above 20000 characters", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const response = await createNote(
      authed(`/api/games/${gameId}/notes`, token, {
        method: "POST",
        body: { content: "x".repeat(20001) },
      }),
      gameParams(gameId),
    );
    expect(response.status).toBe(400);
  });

  it("rejects unknown fields", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const response = await createNote(
      authed(`/api/games/${gameId}/notes`, token, {
        method: "POST",
        body: { content: "Valid", title: "Nope" },
      }),
      gameParams(gameId),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 GAME_NOT_FOUND for unknown userGame", async () => {
    const token = await tokenFor();
    const response = await createNote(
      authed("/api/games/000000000000000000000000/notes", token, {
        method: "POST",
        body: { content: "Valid" },
      }),
      gameParams("000000000000000000000000"),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("GAME_NOT_FOUND");
  });

  it("returns 400 for malformed userGame id", async () => {
    const token = await tokenFor();
    const response = await createNote(
      authed("/api/games/nope/notes", token, {
        method: "POST",
        body: { content: "Valid" },
      }),
      gameParams("nope"),
    );
    expect(response.status).toBe(400);
  });

  it("another user cannot create notes on a foreign userGame", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    await register(postRequest("/api/auth/register", OTHER_USER));
    const otherToken = await tokenFor(OTHER_USER);
    const response = await createNote(
      authed(`/api/games/${gameId}/notes`, otherToken, {
        method: "POST",
        body: { content: "Hijack" },
      }),
      gameParams(gameId),
    );
    expect(response.status).toBe(404);
    expect(await UserGameNote.countDocuments()).toBe(0);
  });
});

describe("GET /api/games/:userGameId/notes", () => {
  it("lists notes newest first with pagination", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    for (const content of ["First", "Second", "Third"]) {
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content },
        }),
        gameParams(gameId),
      );
    }
    const response = await listNotes(
      authed(`/api/games/${gameId}/notes?page=1&limit=2`, token),
      gameParams(gameId),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((n: { content: string }) => n.content)).toEqual([
      "Third",
      "Second",
    ]);
    expect(body.pagination.total).toBe(3);
    expect(body.pagination.totalPages).toBe(2);
    expect(body.data[0]._id).toBeDefined();
    expect(body.data[0].createdAt).toBeDefined();
    expect(body.data[0].updatedAt).toBeDefined();
  });

  it("returns empty list for a game without notes", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const response = await listNotes(
      authed(`/api/games/${gameId}/notes`, token),
      gameParams(gameId),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });

  it("another user cannot list foreign notes", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    await createNote(
      authed(`/api/games/${gameId}/notes`, token, {
        method: "POST",
        body: { content: "Private" },
      }),
      gameParams(gameId),
    );
    await register(postRequest("/api/auth/register", OTHER_USER));
    const otherToken = await tokenFor(OTHER_USER);
    const response = await listNotes(
      authed(`/api/games/${gameId}/notes`, otherToken),
      gameParams(gameId),
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/games/:userGameId/notes/:noteId", () => {
  it("updates content and bumps updatedAt only", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const created = await (
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Before" },
        }),
        gameParams(gameId),
      )
    ).json();
    const response = await patchNote(
      authed(`/api/games/${gameId}/notes/${created.data._id}`, token, {
        method: "PATCH",
        body: { content: "After" },
      }),
      noteParams(gameId, created.data._id),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.content).toBe("After");
    expect(body.data.createdAt).toBe(created.data.createdAt);
    expect(new Date(body.data.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(body.data.createdAt).getTime(),
    );
  });

  it("rejects empty content", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const created = await (
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Before" },
        }),
        gameParams(gameId),
      )
    ).json();
    const response = await patchNote(
      authed(`/api/games/${gameId}/notes/${created.data._id}`, token, {
        method: "PATCH",
        body: { content: "   " },
      }),
      noteParams(gameId, created.data._id),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for unknown note and cross-game noteId", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const otherGameId = await createUserGameId(token);
    const created = await (
      await createNote(
        authed(`/api/games/${otherGameId}/notes`, token, {
          method: "POST",
          body: { content: "Other game" },
        }),
        gameParams(otherGameId),
      )
    ).json();
    for (const [gid, nid] of [
      [gameId, "000000000000000000000000"],
      [gameId, created.data._id],
    ] as const) {
      const response = await patchNote(
        authed(`/api/games/${gid}/notes/${nid}`, token, {
          method: "PATCH",
          body: { content: "Hijack" },
        }),
        noteParams(gid, nid),
      );
      expect(response.status).toBe(404);
    }
  });

  it("another user cannot edit foreign notes", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const created = await (
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Mine" },
        }),
        gameParams(gameId),
      )
    ).json();
    await register(postRequest("/api/auth/register", OTHER_USER));
    const otherToken = await tokenFor(OTHER_USER);
    const response = await patchNote(
      authed(`/api/games/${gameId}/notes/${created.data._id}`, otherToken, {
        method: "PATCH",
        body: { content: "Hijack" },
      }),
      noteParams(gameId, created.data._id),
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/games/:userGameId/notes/:noteId", () => {
  it("deletes with 204 and removes only that note", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const first = await (
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Keep" },
        }),
        gameParams(gameId),
      )
    ).json();
    const second = await (
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Drop" },
        }),
        gameParams(gameId),
      )
    ).json();
    const response = await deleteNote(
      authed(`/api/games/${gameId}/notes/${second.data._id}`, token, {
        method: "DELETE",
      }),
      noteParams(gameId, second.data._id),
    );
    expect(response.status).toBe(204);
    expect(await UserGameNote.countDocuments()).toBe(1);
    expect(await UserGameNote.findById(first.data._id)).not.toBeNull();
  });

  it("returns 404 for unknown note", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const response = await deleteNote(
      authed(`/api/games/${gameId}/notes/000000000000000000000000`, token, {
        method: "DELETE",
      }),
      noteParams(gameId, "000000000000000000000000"),
    );
    expect(response.status).toBe(404);
  });

  it("deleting a userGame cascades its notes but keeps the GlobalGame", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    for (const content of ["A", "B", "C"]) {
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content },
        }),
        gameParams(gameId),
      );
    }
    expect(await UserGameNote.countDocuments()).toBe(3);
    const gamesBefore = await GlobalGame.countDocuments();
    const response = await deleteUserGame(
      authed(`/api/games/${gameId}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ gameId }) },
    );
    expect(response.status).toBe(204);
    expect(await UserGameNote.countDocuments()).toBe(0);
    expect(await GlobalGame.countDocuments()).toBe(gamesBefore);
  });
});

describe("notes concurrency", () => {
  it("supports concurrent creates without loss", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const responses = await Promise.all(
      ["A", "B", "C", "D", "E"].map((content) =>
        createNote(
          authed(`/api/games/${gameId}/notes`, token, {
            method: "POST",
            body: { content },
          }),
          gameParams(gameId),
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await UserGameNote.countDocuments()).toBe(5);
  });

  it("editing a deleted note returns 404", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    const created = await (
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Ephemeral" },
        }),
        gameParams(gameId),
      )
    ).json();
    const deleted = await deleteNote(
      authed(`/api/games/${gameId}/notes/${created.data._id}`, token, {
        method: "DELETE",
      }),
      noteParams(gameId, created.data._id),
    );
    expect(deleted.status).toBe(204);
    const edited = await patchNote(
      authed(`/api/games/${gameId}/notes/${created.data._id}`, token, {
        method: "PATCH",
        body: { content: "Too late" },
      }),
      noteParams(gameId, created.data._id),
    );
    expect(edited.status).toBe(404);
  });
});

describe("notes do not leak into game reads", () => {
  it("listGames payloads carry no notes", async () => {
    const token = await tokenFor();
    const gameId = await createUserGameId(token);
    await createNote(
      authed(`/api/games/${gameId}/notes`, token, {
        method: "POST",
        body: { content: "Hidden" },
      }),
      gameParams(gameId),
    );
    const { GET: listGames } = await import("@/app/api/games/route");
    const response = await listGames(
      authed("/api/games", token),
    );
    const body = await response.json();
    expect(body.data[0]).not.toHaveProperty("notes");
  });
});
