/**
 * Save State-side BFF request schemas (browser → BFF boundary).
 * Client-safe (Zod only); distinct from the ATP DTO schemas in
 * server/atp/schemas.ts, which validate the ATP → BFF boundary.
 */

import { z } from "zod";
import { GAME_STATUSES } from "@/schemas/games";

export const atpIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "must be a valid ATP id");

export const atpSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const atpIdParamSchema = z.object({ id: atpIdSchema });

const importPersonalSchema = z.object({
  status: z.enum(GAME_STATUSES).optional(),
  hoursPlayed: z.number().min(0).max(100000).optional(),
  timesFinished: z.number().int().min(0).max(10000).optional(),
  rating: z.number().min(0).max(10).optional(),
  review: z.string().trim().max(20000).optional(),
});

export const atpImportSchema = z.object({
  atpId: atpIdSchema,
  personal: importPersonalSchema.optional(),
});

export type AtpImportInput = z.infer<typeof atpImportSchema>;
