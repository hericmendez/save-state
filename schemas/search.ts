/**
 * Neutral search BFF schemas (browser → /api/search/* boundary).
 *
 * Provider-agnostic: the browser speaks Save State's catalog contract
 * (q/search, platform, genre, year, developer, publisher, family) and
 * never knows whether ATP or IGDB serves the request. Each provider
 * translates these filters to its own API.
 *
 * Validation mirrors schemas/atp.ts 1:1 so behavior is preserved during
 * the /api/atp/* → /api/search/* migration. schemas/atp.ts remains as a
 * compatibility alias until all consumers migrate.
 */

import { z } from "zod";
import { GAME_STATUSES, validateAchievements } from "@/schemas/games";

export const searchExternalIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "must be a valid external id");

export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    discover: z
      .enum(["true", "false"])
      .optional()
      .default("false")
      .transform((value) => value === "true"),
    platform: z.string().trim().min(1).max(100).optional(),
    /**
     * Explicit IGDB platform ids (Parte B). Typed internal contract:
     * produced only by fixed editorial context, validated here at the
     * BFF boundary (comma-separated positive ints, deduped, capped).
     * Never overloads `platform`: a numeric `platform` value is NOT
     * interpreted as an id (name resolution stays exact-match).
     */
    platformIds: z
      .string()
      .trim()
      .regex(
        /^[0-9]{1,10}(,[0-9]{1,10}){0,49}$/,
        "must be a comma-separated list of positive platform ids",
      )
      .transform((value) => [...new Set(value.split(",").map(Number))])
      .refine((ids) => ids.every((id) => Number.isSafeInteger(id) && id > 0), {
        message: "must be a list of positive platform ids",
      })
      .optional(),
    genre: z.string().trim().min(1).max(100).optional(),
    // Inclusive year range; each bound optional. Replaces the former
    // single `year` (kept below as a deprecated alias for old links).
    yearMin: z.coerce.number().int().min(1950).max(2100).optional(),
    yearMax: z.coerce.number().int().min(1950).max(2100).optional(),
    // Deprecated single-year alias: maps to [year, year] when the range
    // bounds are absent. Remove with the next breaking contract change.
    year: z.coerce.number().int().min(1950).max(2100).optional(),
    developer: z.string().trim().min(1).max(100).optional(),
    publisher: z.string().trim().min(1).max(100).optional(),
    family: z.string().trim().min(1).max(100).optional(),
    // Índice alfanumérico: bucket de inicial do título (Todos = ausente).
    // Só letras A–Z, "0-9" e "#" — ver features/atp/atp-search-query.ts.
    initial: z
      .enum([
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
        "0-9", "#",
      ])
      .optional(),
    // Sort key: absent (or explicit "relevance" with text) means the
    // provider default. Only title/year are server-sortable; other
    // dimensions have no IGDB-native ordering (see docs).
    sortBy: z.enum(["relevance", "title", "year"]).optional(),
    // Direction only applies to an explicit title/year sort; each field
    // has its own default (title ASC, year DESC) when omitted.
    order: z.enum(["asc", "desc"]).optional(),
  })
  .transform((data) => {
    const { year, ...rest } = data;
    return {
      ...rest,
      yearMin: rest.yearMin ?? year,
      yearMax: rest.yearMax ?? year,
    };
  })
  .refine(
    (data) =>
      data.q !== "" ||
      data.platform !== undefined ||
      data.platformIds !== undefined ||
      data.genre !== undefined ||
      data.yearMin !== undefined ||
      data.yearMax !== undefined ||
      data.developer !== undefined ||
      data.publisher !== undefined ||
      data.family !== undefined ||
      data.initial !== undefined,
    { message: "query or at least one filter is required" },
  )
  .refine(
    (data) =>
      data.yearMin === undefined ||
      data.yearMax === undefined ||
      data.yearMin <= data.yearMax,
    { message: "yearMin must be less than or equal to yearMax" },
  );

export const searchIdParamSchema = z.object({ id: searchExternalIdSchema });

export const searchPlatformsQuerySchema = z.object({
  companyName: z.string().trim().min(1).max(100).optional(),
  platformStatus: z.enum(["active", "inactive", "discontinued"]).optional(),
  releaseYear: z.coerce.number().int().min(1950).max(2100).optional(),
  showEmptyPlatforms: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["name", "releaseYear", "gameCount"]).optional(),
  order: z.enum(["asc", "desc"]).optional().default("asc"),
});

export const searchCoverSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(9).default(6),
});

const searchImportPersonalSchema = z.object({
  status: z.enum(GAME_STATUSES).optional(),
  hoursPlayed: z.number().min(0).max(100000).optional(),
  timesFinished: z.number().int().min(0).max(10000).optional(),
  rating: z.number().min(0).max(10).optional(),
  review: z.string().trim().max(20000).optional(),
  favorite: z.boolean().optional(),
  fullyCompleted: z.boolean().optional(),
  achievements: z.boolean().optional(),
  achievementProgress: z.number().int().min(0).max(100).nullable().optional(),
});

export const searchImportSchema = z
  .object({
    externalId: searchExternalIdSchema,
    personal: searchImportPersonalSchema.optional(),
    // Opt-in restrictive policy for the "edit and add" flow: a pre-existing
    // snapshot is rejected instead of silently reused. Absent = legacy
    // reuse behavior for current callers.
    conflictPolicy: z.enum(["reject-existing"]).optional(),
  })
  .refine(
    (data) =>
      data.personal === undefined || validateAchievements(data.personal),
    {
      message: "achievementProgress must be null when achievements is false",
      path: ["personal", "achievementProgress"],
    },
  );

export type SearchImportInput = z.infer<typeof searchImportSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
