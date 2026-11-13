import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createGame } from "@/app/api/games/route";
import { POST as createNote } from "@/app/api/games/[gameId]/notes/route";
import { PATCH as patchNote } from "@/app/api/games/[gameId]/notes/[noteId]/route";
import { DELETE as deleteNote } from "@/app/api/games/[gameId]/notes/[noteId]/route";
import { Activity } from "@/db/models/activity";
import { User } from "@/db/models/user";
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

async function tokenFor(): Promise<{ token: string; userId: string }> {
  await register(postRequest("/api/auth/register", TEST_USER));
  await markTestUserVerified(TEST_USER.email);
  const response = await login(
    postRequest("/api/auth/login", {
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
  );
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  const user = await User.findOne({ email: TEST_USER.email }).lean();
  return { token, userId: String(user!._id) };
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

async function createUserGameId(token: string): Promise<string> {
  const response = await createGame(
    authed("/api/games", token, {
      method: "POST",
      body: { game: { name: "Hollow Knight", cover: "https://cover.test/hk.png" }, status: "playing" },
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

async function activityTypes(): Promise<string[]> {
  const docs = await Activity.find({}).sort({ _id: 1 }).lean();
  return docs.map((doc) => doc.type);
}

describe("note.created activity", () => {
  it("records type, actor, userGameId, game snapshot and noteId", async () => {
    const { token, userId } = await tokenFor();
    const gameId = await createUserGameId(token);
    const response = await createNote(
      authed(`/api/games/${gameId}/notes`, token, {
        method: "POST",
        body: { content: "First impressions" },
      }),
      gameParams(gameId),
    );
    expect(response.status).toBe(201);
    const noteId = (await response.json()).data._id as string;

    const docs = await Activity.find({ type: "note.created" }).lean();
    expect(docs).toHaveLength(1);
    expect(String(docs[0].userId)).toBe(userId);
    expect(String(docs[0].userGameId)).toBe(gameId);
    expect(docs[0].game).toMatchObject({
      name: "Hollow Knight",
      cover: "https://cover.test/hk.png",
    });
    expect(docs[0].metadata).toMatchObject({ noteId });
    // Content stays in the note, never duplicated into the event.
    expect(JSON.stringify(docs[0])).not.toContain("First impressions");
  });

  it("editing a note creates no activity", async () => {
    const { token } = await tokenFor();
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
    expect(await activityTypes()).toEqual(["game.added", "note.created"]);
    const response = await patchNote(
      authed(`/api/games/${gameId}/notes/${created.data._id}`, token, {
        method: "PATCH",
        body: { content: "After" },
      }),
      noteParams(gameId, created.data._id),
    );
    expect(response.status).toBe(200);
    expect(await activityTypes()).toEqual(["game.added", "note.created"]);
  });

  it("deleting a note creates no activity and keeps history", async () => {
    const { token } = await tokenFor();
    const gameId = await createUserGameId(token);
    const created = await (
      await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Gone" },
        }),
        gameParams(gameId),
      )
    ).json();
    const response = await deleteNote(
      authed(`/api/games/${gameId}/notes/${created.data._id}`, token, {
        method: "DELETE",
      }),
      noteParams(gameId, created.data._id),
    );
    expect(response.status).toBe(204);
    expect(await activityTypes()).toEqual(["game.added", "note.created"]);
  });

  it("note creation survives an activity persistence failure", async () => {
    const { token } = await tokenFor();
    const gameId = await createUserGameId(token);
    const createSpy = vi
      .spyOn(Activity, "create")
      .mockRejectedValueOnce(new Error("db down"));
    try {
      const response = await createNote(
        authed(`/api/games/${gameId}/notes`, token, {
          method: "POST",
          body: { content: "Resilient" },
        }),
        gameParams(gameId),
      );
      expect(response.status).toBe(201);
      const { UserGameNote } = await import("@/db/models/user-game-note");
      expect(await UserGameNote.countDocuments()).toBe(1);
      expect(await activityTypes()).toEqual(["game.added"]);
    } finally {
      createSpy.mockRestore();
    }
  });
});
