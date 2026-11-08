/**
 * UserGame notes service. Callable directly by Server Components and by
 * Route Handlers — both share this module, never HTTP between them.
 *
 * Ownership is always resolved through the parent UserGame
 * (`findOwnedUserGameOrThrow`), never from the note alone.
 */

import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";
import {
  UserGameNote,
  type UserGameNoteDocument,
} from "@/db/models/user-game-note";
import { UserGame } from "@/db/models/user-game";
import { parseActivityEvent } from "@/schemas/activity";
import { recordActivity } from "@/server/activity/service";
import type {
  CreateNoteInput,
  ListNotesQuery,
  UpdateNoteInput,
} from "@/schemas/notes";
import {
  buildPaginatedResponse,
  pageOffset,
  type PaginatedResponse,
} from "@/server/shared/pagination";

export interface UserGameNoteDTO {
  _id: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PaginatedUserGameNote = PaginatedResponse<UserGameNoteDTO>;

function toNoteDTO(note: UserGameNoteDocument): UserGameNoteDTO {
  return {
    _id: note._id as Types.ObjectId,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

async function findOwnedUserGameOrThrow(userId: string, gameId: string) {
  let userGame;
  try {
    userGame = await UserGame.findOne({
      _id: gameId,
      userId: new Types.ObjectId(userId),
    });
  } catch {
    throw new ApiError("INVALID_GAME_ID", "Invalid game id", 400);
  }
  if (!userGame) {
    throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
  }
  return userGame;
}

async function findOwnedNoteOrThrow(userGameId: string, noteId: string) {
  let note: UserGameNoteDocument | null = null;
  try {
    note = await UserGameNote.findOne({
      _id: noteId,
      userGameId: new Types.ObjectId(userGameId),
    });
  } catch {
    throw new ApiError("INVALID_NOTE_ID", "Invalid note id", 400);
  }
  if (!note) {
    throw new ApiError("NOTE_NOT_FOUND", "Note not found", 404);
  }
  return note;
}

export async function createNote(
  userId: string,
  gameId: string,
  input: CreateNoteInput,
): Promise<UserGameNoteDTO> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);
  const note = await UserGameNote.create({
    userId: userGame.userId,
    userGameId: userGame._id,
    content: input.content,
  });

  // Activity Feed (best effort): the note already exists. Persistence
  // failures are logged inside recordActivity and never fail creation.
  const game = await GlobalGame.findById(userGame.gameId);
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "note.created",
      userGameId: String(userGame._id),
      game: game ? { name: game.name, ...(game.cover ? { cover: game.cover } : {}) } : { name: "Unknown game" },
      metadata: { noteId: String(note._id) },
    }),
  );

  return toNoteDTO(note);
}

export async function listNotes(
  userId: string,
  gameId: string,
  filters: ListNotesQuery,
): Promise<PaginatedUserGameNote> {
  await connectDatabase();
  await findOwnedUserGameOrThrow(userId, gameId);
  const query = { userGameId: new Types.ObjectId(gameId) };
  const [total, notes] = await Promise.all([
    UserGameNote.countDocuments(query),
    UserGameNote.find(query)
      .sort({ createdAt: -1 })
      .skip(pageOffset(filters))
      .limit(filters.limit),
  ]);
  return buildPaginatedResponse(notes.map(toNoteDTO), total, filters);
}

export async function updateNote(
  userId: string,
  gameId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<UserGameNoteDTO> {
  await connectDatabase();
  await findOwnedUserGameOrThrow(userId, gameId);
  const note = await findOwnedNoteOrThrow(gameId, noteId);
  note.content = input.content;
  await note.save();
  // Intentionally no Activity: edits are silent, like `review`.
  return toNoteDTO(note);
}

export async function deleteNote(
  userId: string,
  gameId: string,
  noteId: string,
): Promise<void> {
  await connectDatabase();
  await findOwnedUserGameOrThrow(userId, gameId);
  const note = await findOwnedNoteOrThrow(gameId, noteId);
  // Intentionally no Activity: removals are silent.
  await note.deleteOne();
}
