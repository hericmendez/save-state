/**
 * Save State-side BFF request schemas (browser → BFF boundary).
 * Client-safe (Zod only); distinct from the ATP DTO schemas in
 * server/atp/schemas.ts, which validate the ATP → BFF boundary.
 */

import { z } from "zod";
import { GAME_STATUSES } from "@/schemas/games";
import { reviewCreateInputSchema } from "@/schemas/reviews";

export const atpIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "must be a valid ATP id");

export const atpSearchQuerySchema = z
  .object({
    // Text is optional when a refinement filter is present (e.g. platform
    // directory deep-links browse without text). At least one of text or
    // filter is required.
    q: z.string().trim().max(200).optional().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // Explicit opt-in forwarded to ATP GET /api/v1/games/search as
    // `discover=true` (metadata lookup). Defaults to false so catalog
    // browsing stays a pure database read.
    discover: z
      .enum(["true", "false"])
      .optional()
      .default("false")
      .transform((value) => value === "true"),
    // Refinement filters. Allowlisted 1:1 onto ATP GET /api/v1/games
    // (platform/genre accept ATP's comma-separated form; year mirrors
    // ATP's releaseYear bounds; family maps onto ATP's platformFamily
    // taxonomy — values come from ATP platform data, never invented).
    // Unknown params are stripped by Zod.
    platform: z.string().trim().min(1).max(100).optional(),
    genre: z.string().trim().min(1).max(100).optional(),
    year: z.coerce.number().int().min(1950).max(2100).optional(),
    developer: z.string().trim().min(1).max(100).optional(),
    publisher: z.string().trim().min(1).max(100).optional(),
    family: z.string().trim().min(1).max(100).optional(),
  })
  .refine(
    (data) =>
      data.q !== "" ||
      data.platform !== undefined ||
      data.genre !== undefined ||
      data.year !== undefined ||
      data.developer !== undefined ||
      data.publisher !== undefined ||
      data.family !== undefined,
    { message: "query or at least one filter is required" },
  );

export const atpIdParamSchema = z.object({ id: atpIdSchema });

export const atpPlatformsQuerySchema = z.object({
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

export const atpCoverSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(9).default(6),
});

const importPersonalSchema = z.object({
  status: z.enum(GAME_STATUSES).optional(),
  hoursPlayed: z.number().min(0).max(100000).optional(),
  timesFinished: z.number().int().min(0).max(10000).optional(),
  rating: z.number().min(0).max(10).optional(),
  // Phase 3: legacy `review: string` OR new `review: { content }` (same
  // contract as POST /api/games; createGame normalizes both atomically).
  review: reviewCreateInputSchema.optional(),
});

export const atpImportSchema = z.object({
  atpId: atpIdSchema,
  personal: importPersonalSchema.optional(),
});

export type AtpImportInput = z.infer<typeof atpImportSchema>;
