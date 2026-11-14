/**
 * Fase 1 — Diário: text search (game/list snapshot names + note contents),
 * temporal validation, and ownership of the extended /api/activity contract.
 */

import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as getFeed } from "@/app/api/activity/route";
import { Activity } from "@/db/models/activity";
import { createGame } from "@/server/games/service";
import { createNote, deleteNote } from "@/server/notes/service";
import {
  clearDatabase,
  postRequest,
  markTestUserVerified,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

const PASSWORD = "password-123";

async function registerUser(name: string, email: string) {
  await register(postRequest("/api/auth/register", { name, email, password: PASSWORD }));
  await markTestUserVerified(email);
  const response = await login(postRequest("/api/auth/login", { email, password: PASSWORD }));
  const token = response.cookies.get("token")?.value;
  if (!token) throw new Error("login did not issue a token");
  return { token };
}

function getRequest(token: string, query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/activity${query}`, {
    headers: { cookie: `token=${token}` },
  });
}

async function seedGame(
  userId: string,
  name: string,
  listName?: string,
): Promise<{ userGameId: string }> {
  const created = await createGame({
    userId,
    game: { name },
    status: "backlog",
  });
  const userGameId = String(created._id);
  if (listName) {
    const { GameCollection } = await import("@/db/models/game-collection");
    const { addCollectionToGame } = await import("@/server/collections/service");
    const list = await GameCollection.create({ userId, name: listName });
    await addCollectionToGame(userId, userGameId, String(list._id));
  }
  return { userGameId };
}

function memberTypes(body: Record<string, unknown>): string[] {
  const data = body.data as Array<{ members: Array<{ type: string }> }>;
  return data.flatMap((item) => item.members.map((m) => m.type));
}

describe("diary text search", () => {
  it("matches game snapshot names (partial, case-insensitive)", async () => {
    const { token } = await registerUser("A", "a@test.com");
    const { User } = await import("@/db/models/user");
    const user = await User.findOne({ email: "a@test.com" }).lean();
    const userId = String(user?._id);
    await seedGame(userId, "Elden Ring");
    await seedGame(userId, "Chrono Trigger");

    const res = await getFeed(getRequest(token, "?q=elden"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const names = (
      body.data as Array<{ members: Array<{ game?: { name: string } }> }>
    ).flatMap((item) => item.members.map((m) => m.game?.name));
    expect(names).toContain("Elden Ring");
    expect(names).not.toContain("Chrono Trigger");
  });

  it("matches collection snapshot names", async () => {
    const { token } = await registerUser("A", "a@test.com");
    const { User } = await import("@/db/models/user");
    const user = await User.findOne({ email: "a@test.com" }).lean();
    const userId = String(user?._id);
    await seedGame(userId, "Some Game", "Wishlist Final");

    const res = await getFeed(getRequest(token, "?q=wishlist"));
    expect(res.status).toBe(200);
    expect(memberTypes(await res.json())).toContain("game.added_to_collection");
  });

  it("still finds legacy list.* events by snapshot name", async () => {
    const { token } = await registerUser("A", "a@test.com");
    const { User } = await import("@/db/models/user");
    const user = await User.findOne({ email: "a@test.com" }).lean();
    const userId = String(user?._id);
    const { Activity } = await import("@/db/models/activity");
    await Activity.create({
      userId,
      type: "game.added_to_list",
      userGameId: "000000000000000000000001",
      game: { name: "Old Game" },
      list: { listId: "000000000000000000000002", name: "Legacy Wishlist" },
      metadata: {},
    });

    const res = await getFeed(getRequest(token, "?q=legacy"));
    expect(res.status).toBe(200);
    expect(memberTypes(await res.json())).toContain("game.added_to_list");
  });

  it("finds note.created by note content without duplicating the source", async () => {
    const { token } = await registerUser("A", "a@test.com");
    const { User } = await import("@/db/models/user");
    const user = await User.findOne({ email: "a@test.com" }).lean();
    const userId = String(user?._id);
    const { userGameId } = await seedGame(userId, "Hollow Knight");
    await createNote(userId, userGameId, { content: "derrotar o chefe secreto" });

    const res = await getFeed(getRequest(token, "?q=secreto"));
    expect(res.status).toBe(200);
    expect(memberTypes(await res.json())).toContain("note.created");
  });

  it("never matches another user's note contents", async () => {
    const { token: tokenA } = await registerUser("A", "a@test.com");
    await registerUser("B", "b@test.com");
    const { User } = await import("@/db/models/user");
    const userB = await User.findOne({ email: "b@test.com" }).lean();
    const userBId = String(userB?._id);
    const { userGameId } = await seedGame(userBId, "B Game");
    await createNote(userBId, userGameId, { content: "segredoexclusivob" });

    const res = await getFeed(getRequest(tokenA, "?q=segredoexclusivob"));
    expect(res.status).toBe(200);
    expect(memberTypes(await res.json())).not.toContain("note.created");
  });

  it("keeps the event after note deletion without matching its content", async () => {
    const { token } = await registerUser("A", "a@test.com");
    const { User } = await import("@/db/models/user");
    const user = await User.findOne({ email: "a@test.com" }).lean();
    const userId = String(user?._id);
    const { userGameId } = await seedGame(userId, "C Game");
    const note = await createNote(userId, userGameId, {
      content: "conteudoapagado",
    });
    await deleteNote(userId, userGameId, String(note._id));

    const res = await getFeed(getRequest(token, "?q=conteudoapagado"));
    expect(res.status).toBe(200);
    expect(memberTypes(await res.json())).not.toContain("note.created");
    // …but the event itself survives unfiltered reads (append-only).
    const all = await getFeed(getRequest(token));
    expect(memberTypes(await all.json())).toContain("note.created");
  });

  it("treats empty q as no filter and escapes regex safely", async () => {
    const { token } = await registerUser("A", "a@test.com");
    const { User } = await import("@/db/models/user");
    const user = await User.findOne({ email: "a@test.com" }).lean();
    await seedGame(String(user?._id), "D Game");

    const empty = await getFeed(getRequest(token, "?q="));
    expect(empty.status).toBe(200);
    const tricky = await getFeed(getRequest(token, "?q=.*%28"));
    expect(tricky.status).toBe(200);
  });

  it("rejects from > to with INVALID_QUERY", async () => {
    const { token } = await registerUser("A", "a@test.com");
    const res = await getFeed(
      getRequest(token, "?from=2026-09-22&to=2026-09-01"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_QUERY");
  });

  it("scopes userGameId filters to the caller", async () => {
    const { token: tokenA } = await registerUser("A", "a@test.com");
    await registerUser("B", "b@test.com");
    const { User } = await import("@/db/models/user");
    const userB = await User.findOne({ email: "b@test.com" }).lean();
    const { userGameId } = await seedGame(String(userB?._id), "B Private");

    const res = await getFeed(getRequest(tokenA, `?gameId=${userGameId}`));
    expect(res.status).toBe(200);
    expect(
      ((await res.json()).data as Array<unknown>),
    ).toEqual([]);
    // Malformed ids stay contract errors, never leaks.
    const bad = await getFeed(getRequest(tokenA, "?gameId=nope"));
    expect(bad.status).toBe(400);
    expect(await Activity.countDocuments()).toBeGreaterThan(0);
  });
});
