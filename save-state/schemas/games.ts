/**
 * Game query schemas (reads only).
 *
 * Create/update schemas belong to Phase 5 and must not be added here.
 * These import only Zod, so future form boundaries can reuse them.
 */

import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");

/**
 * Canonical game-status vocabulary. Defined here (rather than in the
 * Mongoose model) so Zod schemas, services, and future form boundaries
 * share one client-safe source; the server-only model imports it.
 */
export const GAME_STATUSES = [
  "backlog",
  "playing",
  "replaying",
  "stalled",
  "dropped",
  "limbo",
  "endless",
  "achievement",
  "finished",
  "wishlist",
] as const;

export type GameStatus = (typeof GAME_STATUSES)[number];

const statusEnum = z.enum(GAME_STATUSES);

const numberRange = (min: number, max: number) =>
  z.coerce.number().min(min).max(max);

const listQueryBase = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  listId: objectIdSchema.optional(),
  genre: z.string().trim().max(100).optional(),
  platform: z.string().trim().max(100).optional(),
  developer: z.string().trim().max(200).optional(),
  publisher: z.string().trim().max(200).optional(),
  hoursPlayedMin: numberRange(0, 100000).optional(),
  hoursPlayedMax: numberRange(0, 100000).optional(),
  timesFinishedMin: numberRange(0, 10000).optional(),
  timesFinishedMax: numberRange(0, 10000).optional(),
  ratingMin: numberRange(0, 10).optional(),
  ratingMax: numberRange(0, 10).optional(),
};

export const listGamesQuerySchema = z.object({
  ...listQueryBase,
  status: statusEnum.optional(),
  withoutList: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  yearFrom: z.coerce.number().int().min(1000).max(9999).optional(),
  yearTo: z.coerce.number().int().min(1000).max(9999).optional(),
  orderBy: z.enum(["title", "platform", "releaseYear", "status"]).optional(),
  // Optional so direct service callers keep working: absence means legacy
  // newest-first order (Fase 2 URL defaults supply "asc" for explicit sorts).
  order: z.enum(["asc", "desc"]).optional(),
  releaseDateFrom: z.coerce.date().optional(),
  releaseDateTo: z.coerce.date().optional(),
  favorite: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  finished: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  fullyCompleted: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  achievements: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  achievementsCompleted: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const gameIdParamSchema = z.object({ gameId: objectIdSchema });

const gameMetadataBase = {
  cover: z.string().trim().max(2048).optional(),
  genres: z.array(z.string().trim().min(1)).max(50).optional(),
  platforms: z.array(z.string().trim().min(1)).max(50).optional(),
  developers: z.array(z.string().trim().min(1)).max(50).optional(),
  publishers: z.array(z.string().trim().min(1)).max(50).optional(),
  summary: z.string().trim().max(20000).optional(),
};

const personalFieldsBase = {
  status: statusEnum.optional(),
  hoursPlayed: z.number().min(0).max(100000).optional(),
  timesFinished: z.number().int().min(0).max(10000).optional(),
  favorite: z.boolean().optional(),
  fullyCompleted: z.boolean().optional(),
  achievements: z.boolean().optional(),
  achievementProgress: z.number().int().min(0).max(100).nullable().optional(),
};

function validateAchievements(data: {
  achievements?: boolean;
  achievementProgress?: number | null;
}): boolean {
  if (data.achievements === false && data.achievementProgress !== undefined && data.achievementProgress !== null) {
    return false;
  }
  return true;
}

export const createGameSchema = z
  .object({
    gameId: objectIdSchema.optional(),
    game: z
      .object({
        name: z.string().trim().min(1).max(255),
        ...gameMetadataBase,
        releaseDate: z.coerce.date().optional(),
      })
      .optional(),
    ...personalFieldsBase,
    rating: z.number().min(0).max(10).optional(),
    review: z.string().trim().max(20000).optional(),
  })
  .refine((data) => data.gameId !== undefined || data.game !== undefined, {
    message: "either gameId or game metadata is required",
  })
  .refine(validateAchievements, {
    message: "achievementProgress must be null when achievements is false",
    path: ["achievementProgress"],
  });

export const updateGameSchema = z
  .object({
    game: z
      .object({
        name: z.string().trim().min(1).max(255).optional(),
        ...gameMetadataBase,
        releaseDate: z.coerce.date().nullable().optional(),
      })
      .optional(),
    ...personalFieldsBase,
    rating: z.number().min(0).max(10).nullable().optional(),
    review: z.string().trim().max(20000).nullable().optional(),
  })
  .refine(
    (data) =>
      Object.keys(data).length > 0 &&
      (data.game === undefined || Object.keys(data.game).length > 0),
    { message: "at least one field is required" },
  )
  .refine(validateAchievements, {
    message: "achievementProgress must be null when achievements is false",
    path: ["achievementProgress"],
  });

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;
export type ListGamesQuery = z.infer<typeof listGamesQuerySchema>;
