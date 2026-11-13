/**
 * Game Notes client API (browser mutations only).
 *
 * Thin wrappers over `apiRequest` for the UserGame notes contract:
 *
 * ```text
 * GET    /api/games/:userGameId/notes
 * POST   /api/games/:userGameId/notes
 * PATCH  /api/games/:userGameId/notes/:noteId
 * DELETE /api/games/:userGameId/notes/:noteId
 * ```
 *
 * Server Components must call `server/notes/service` directly instead of
 * using this module. No state, no caching — callers own their UI state.
 */

import { apiRequest } from "@/lib/api-client";

export interface UserGameNote {
  _id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotesPage {
  data: UserGameNote[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export const NOTES_MAX_LENGTH = 20000;

function notesPath(userGameId: string): string {
  return `/api/games/${encodeURIComponent(userGameId)}/notes`;
}

export function listNotes(
  userGameId: string,
  page = 1,
): Promise<NotesPage> {
  return apiRequest<NotesPage>(`${notesPath(userGameId)}?page=${page}`);
}

export function createNote(
  userGameId: string,
  content: string,
): Promise<UserGameNote> {
  return apiRequest<UserGameNote>(notesPath(userGameId), {
    method: "POST",
    body: { content: content.trim() },
  });
}

export function updateNote(
  userGameId: string,
  noteId: string,
  content: string,
): Promise<UserGameNote> {
  return apiRequest<UserGameNote>(
    `${notesPath(userGameId)}/${encodeURIComponent(noteId)}`,
    { method: "PATCH", body: { content: content.trim() } },
  );
}

export function deleteNote(
  userGameId: string,
  noteId: string,
): Promise<void> {
  return apiRequest<void>(
    `${notesPath(userGameId)}/${encodeURIComponent(noteId)}`,
    { method: "DELETE" },
  );
}
