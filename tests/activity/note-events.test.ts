/**
 * Fase 2 — Notes/Activity: only creation emits. Edits and deletions change
 * UserGameNote state, never the append-only history (regression).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Activity } from "@/db/models/activity";
import { User } from "@/db/models/user";
import { createGame } from "@/server/games/service";
import { createNote, deleteNote, updateNote } from "@/server/notes/service";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "../auth/helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

async function setupGameWithNote(content = "primeira anotação"): Promise<{
  userId: string;
  userGameId: string;
  noteId: string;
}> {
  const user = await User.create({
    name: "N",
    email: "n@test.com",
    passwordHash: "hash",
  });
  const userId = String(user._id);
  const created = await createGame({
    userId,
    game: { name: "Note Game" },
    status: "backlog",
  });
  const userGameId = String(created._id);
  const note = await createNote(userId, userGameId, { content });
  return { userId, userGameId, noteId: String(note._id) };
}

async function noteEvents(userId: string) {
  return Activity.countDocuments({ userId, type: "note.created" });
}

describe("note activity emission", () => {
  it("emits exactly one note.created on create", async () => {
    const { userId } = await setupGameWithNote();
    expect(await noteEvents(userId)).toBe(1);
  });

  it("emits nothing on update (content changes, history does not)", async () => {
    const { userId, userGameId, noteId } = await setupGameWithNote();
    await updateNote(userId, userGameId, noteId, { content: "editada" });
    expect(await noteEvents(userId)).toBe(1);
    expect(await Activity.countDocuments({ userId })).toBeGreaterThan(0);
  });

  it("emits nothing on delete and keeps the creation event", async () => {
    const { userId, userGameId, noteId } = await setupGameWithNote();
    await deleteNote(userId, userGameId, noteId);
    expect(await noteEvents(userId)).toBe(1);
  });
});
