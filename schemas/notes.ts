/**
 * UserGame note schemas (validation only).
 *
 * Notes belong to a single UserGame (1:N). Ownership is always resolved
 * through the parent UserGame, never from the note alone.
 */

import { z } from "zod";
import { objectIdSchema } from "@/schemas/games";

export const NOTE_CONTENT_MAX_LENGTH = 20000;

export const noteIdParamSchema = z.object({
  gameId: objectIdSchema,
  noteId: objectIdSchema,
});

export const createNoteSchema = z
  .object({
    content: z.string().trim().min(1).max(NOTE_CONTENT_MAX_LENGTH),
  })
  .strict();

export const updateNoteSchema = z
  .object({
    content: z.string().trim().min(1).max(NOTE_CONTENT_MAX_LENGTH),
  })
  .strict();

export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
