/**
 * Game-list query schemas (reads only).
 *
 * Create/update schemas belong to Phase 5 and must not be added here.
 */

import { z } from "zod";
import { listGamesQuerySchema, objectIdSchema } from "@/schemas/games";

export const listGameListsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  withCount: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const listIdParamSchema = z.object({ listId: objectIdSchema });

export const gameIdAndListIdParamSchema = z.object({
  gameId: objectIdSchema,
  listId: objectIdSchema,
});

export const createGameListSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const updateGameListSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const listGamesInListQuerySchema = listGamesQuerySchema.omit({
  listId: true,
});

export type ListGameListsQuery = z.infer<typeof listGameListsQuerySchema>;
export type ListGamesInListQuery = z.infer<typeof listGamesInListQuerySchema>;
export type CreateGameListInput = z.infer<typeof createGameListSchema>;
export type UpdateGameListInput = z.infer<typeof updateGameListSchema>;
