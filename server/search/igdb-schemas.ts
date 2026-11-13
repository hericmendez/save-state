/**
 * IGDB wire schemas (Etapa 3).
 *
 * Validates the api.igdb.com Apicalypse responses on Save State's side.
 * Shapes are intentionally tolerant (.passthrough(), optional fields):
 * missing optional metadata degrades to empty/undefined, never throws.
 * Rewritten from scratch for Save State — no imports from atp-engine.
 */

import { z } from "zod";

const namedExpansionSchema = z
  .object({ id: z.number(), name: z.string() })
  .passthrough();

const coverSchema = z
  .object({
    id: z.number().optional(),
    url: z.string().optional(),
    image_id: z.string().optional(),
  })
  .passthrough();

export const igdbGameSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string().optional(),
    summary: z.string().nullable().optional(),
    storyline: z.string().nullable().optional(),
    first_release_date: z.number().nullable().optional(),
    genres: z.array(z.union([z.number(), namedExpansionSchema])).optional(),
    platforms: z
      .array(z.union([z.number(), namedExpansionSchema]))
      .optional(),
    involved_companies: z.array(z.number()).optional(),
    cover: coverSchema.nullable().optional(),
    game_type: z.number().nullable().optional(),
    status: z.number().nullable().optional(),
    release_dates: z
      .array(
        z
          .object({
            platform: z
              .union([z.number(), namedExpansionSchema])
              .nullable()
              .optional(),
            date: z.number().nullable().optional(),
            region: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type IgdbGame = z.infer<typeof igdbGameSchema>;

export const igdbGameListSchema = z.array(igdbGameSchema);

/** Minimal cover-only payload (IGDB returns only id + requested fields). */
export const igdbCoverOnlyListSchema = z.array(
  z
    .object({
      id: z.number(),
      cover: coverSchema.nullable().optional(),
    })
    .passthrough(),
);

export const igdbPlatformSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    abbreviation: z.string().nullable().optional(),
    generation: z.number().nullable().optional(),
    platform_family: namedExpansionSchema.nullable().optional(),
    platform_logo: z
      .object({ url: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
    summary: z.string().nullable().optional(),
  })
  .passthrough();

export type IgdbPlatform = z.infer<typeof igdbPlatformSchema>;

export const igdbPlatformListSchema = z.array(igdbPlatformSchema);

export const igdbCompanySchema = z
  .object({ id: z.number(), name: z.string() })
  .passthrough();

export type IgdbCompany = z.infer<typeof igdbCompanySchema>;

export const igdbCompanyListSchema = z.array(igdbCompanySchema);

export const igdbInvolvementSchema = z
  .object({
    id: z.number(),
    company: z.number(),
    developer: z.boolean().optional(),
    publisher: z.boolean().optional(),
  })
  .passthrough();

export const igdbInvolvementListSchema = z.array(igdbInvolvementSchema);

export const igdbGenreSchema = z
  .object({ id: z.number(), name: z.string() })
  .passthrough();

export const igdbGenreListSchema = z.array(igdbGenreSchema);

export const igdbCountSchema = z
  .object({ count: z.number() })
  .passthrough();

export const igdbFamilySchema = z
  .object({ id: z.number(), name: z.string(), slug: z.string().optional() })
  .passthrough();

export const igdbFamilyListSchema = z.array(igdbFamilySchema);
