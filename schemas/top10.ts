import { z } from "zod";
import { objectIdSchema } from "@/schemas/games";

export const TOP10_MAX_SIZE = 10;

export const top10UserGameParamSchema = z.object({
  userGameId: objectIdSchema,
});

export const reorderTop10Schema = z.object({
  top10: z.array(objectIdSchema).max(TOP10_MAX_SIZE),
});

export type ReorderTop10Input = z.infer<typeof reorderTop10Schema>;
