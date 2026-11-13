/**
 * Save State-side Zod schemas for ATP HTTP responses.
 *
 * ATP runs its own Zod version internally (ADR-017); these schemas validate
 * the JSON wire boundary on our side and must never be imported from ATP.
 * Shapes are intentionally tolerant (.passthrough()) so additive ATP-side
 * changes do not break the BFF; required fields stay strict.
 */

import { z } from "zod";

const titleSchema = z
  .object({
    value: z.string(),
    type: z.string(),
  })
  .passthrough();

const releaseDateSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int().nullable().optional(),
    day: z.number().int().nullable().optional(),
    precision: z.string().optional(),
  })
  .passthrough();

const platformSchema = z
  .object({ name: z.string() })
  .passthrough();

const releaseSchema = z
  .object({
    platform: platformSchema.optional(),
    region: z.object({ name: z.string() }).passthrough().nullable().optional(),
    releaseDate: releaseDateSchema.nullable().optional(),
    version: z.string().nullable().optional(),
    edition: z.string().nullable().optional(),
  })
  .passthrough();

const organizationSchema = z
  .object({ name: z.string() })
  .passthrough();

const genreSchema = z
  .object({ name: z.string() })
  .passthrough();

const externalIdentifierSchema = z
  .object({ source: z.string(), id: z.string() })
  .passthrough();

export const atpGameSchema = z
  .object({
    id: z.string(),
    titles: z.array(titleSchema).default([]),
    releases: z.array(releaseSchema).default([]),
    developers: z.array(organizationSchema).default([]),
    publishers: z.array(organizationSchema).default([]),
    genres: z.array(genreSchema).default([]),
    externalIdentifiers: z.array(externalIdentifierSchema).default([]),
    description: z.string().nullable().optional(),
  })
  .passthrough();

export type AtpGame = z.infer<typeof atpGameSchema>;

export const atpSearchResponseSchema = z
  .object({
    data: z.array(atpGameSchema),
    pagination: z
      .object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

export type AtpSearchResponse = z.infer<typeof atpSearchResponseSchema>;

export const atpPlatformSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    company: z.string(),
    releaseYear: z.number().int().nullable().optional(),
    status: z.string(),
    family: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    // Editorial hardware generation (Fase 1 ATP): positive integer for
    // console/handheld/hybrid, null otherwise. Optional for tolerance —
    // the BFF only forwards it to Platform Details consumers.
    generation: z.number().int().nullable().optional(),
    // Canonical ATP contract (Fase 7.1): PlatformThumb object, not a
    // string. The Save State UI does not render platform thumbs; the
    // shape is validated structurally and otherwise ignored.
    thumb: z
      .object({
        logo: z.string().nullable(),
        image: z.string().nullable(),
      })
      .nullable()
      .optional(),
    gameCount: z.number().int(),
  })
  .passthrough();

export type AtpPlatform = z.infer<typeof atpPlatformSchema>;

export const atpPlatformListResponseSchema = z
  .object({
    data: z.array(atpPlatformSchema),
    pagination: z
      .object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

export type AtpPlatformListResponse = z.infer<typeof atpPlatformListResponseSchema>;

const coverCandidateSchema = z
  .object({
    url: z.string(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    source: z.string().nullable().optional(),
  })
  .passthrough();

const coverSelectionSchema = z
  .object({
    url: z.string(),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    source: z.string().nullable().optional(),
  })
  .passthrough()
  .nullable();

export const atpCoverResponseSchema = z
  .object({
    data: z
      .object({
        gameId: z.string(),
        selected: coverSelectionSchema.optional(),
        candidates: z.array(coverCandidateSchema).default([]),
      })
      .passthrough(),
  })
  .passthrough();

export type AtpCoverResponse = z.infer<typeof atpCoverResponseSchema>;

export const atpCoverSearchResponseSchema = z
  .object({
    data: z
      .object({
        candidates: z.array(coverCandidateSchema).default([]),
      })
      .passthrough(),
  })
  .passthrough();

export type AtpCoverSearchResponse = z.infer<typeof atpCoverSearchResponseSchema>;

export const atpErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();
