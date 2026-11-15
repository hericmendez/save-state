/**
 * Game-collection query schemas.
 *
 * New domain names (Etapa 6). Legacy /api/game-lists routes translate
 * their params to these schemas in the adapter layer.
 */

import { z } from "zod";
import {
  collectionGamesQueryInputSchema,
  normalizeCollectionKeys,
  objectIdSchema,
} from "@/schemas/games";

export const collectionGameCollectionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  withCount: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const collectionIdParamSchema = z.object({
  collectionId: objectIdSchema,
});

export const gameIdAndCollectionIdParamSchema = z.object({
  gameId: objectIdSchema,
  collectionId: objectIdSchema,
});

export const createGameCollectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const updateGameCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const collectionGamesInCollectionQuerySchema =
  collectionGamesQueryInputSchema
    .omit({
      collectionId: true,
      listId: true,
    })
    .transform(normalizeCollectionKeys);

export type CollectionGameCollectionsQuery = z.infer<
  typeof collectionGameCollectionsQuerySchema
>;
export type CollectionGamesInCollectionQuery = z.infer<
  typeof collectionGamesInCollectionQuerySchema
>;
export type CreateGameCollectionInput = z.infer<
  typeof createGameCollectionSchema
>;
export type UpdateGameCollectionInput = z.infer<
  typeof updateGameCollectionSchema
>;
