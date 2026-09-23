/**
 * Activity Feed schemas: closed event registry with per-type metadata.
 *
 * Design contract (see server/activity/service.ts):
 *
 * ```text
 * domain service (decides WHAT happened)
 *     ↓
 * Zod validation here (structure guarantee)
 *     ↓
 * recordActivity(userId, validatedEvent) (persistence only, best effort)
 * ```
 *
 * Client-safe: imports only Zod + the shared game-status vocabulary, so
 * future presentation registries (features/activity/messages.ts) can reuse
 * the type list without touching server code.
 */

import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { GAME_STATUSES, objectIdSchema } from "@/schemas/games";

export const ACTIVITY_TYPES = [
  "game.added",
  "game.removed",
  "game.status_changed",
  "game.finished",
  "game.times_finished_changed",
  "game.favorited",
  "game.unfavorited",
  "game.completed",
  "game.uncompleted",
  "game.rating_changed",
  "game.hours_changed",
  "game.achievements_changed",
  "note.created",
  "game.added_to_list",
  "game.removed_from_list",
  "list.created",
  "list.renamed",
  "list.deleted",
  "top10.added",
  "top10.removed",
  "top10.reordered",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const TOP10_REMOVE_REASONS = ["manual", "unfavorited", "game_deleted"] as const;

export type Top10RemoveReason = (typeof TOP10_REMOVE_REASONS)[number];

const statusEnum = z.enum(GAME_STATUSES);

const gameSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(255),
  cover: z.string().trim().max(2048).optional(),
});

const listSnapshotSchema = z.object({
  listId: objectIdSchema.optional(),
  name: z.string().trim().min(1).max(100),
});

const ratingValue = z.number().min(0).max(10).nullable();

const achievementsState = z.object({
  enabled: z.boolean(),
  progress: z.number().int().min(0).max(100).nullable(),
});

const emptyMetadata = z.object({}).strict();

function gameEvent<TType extends string, TMeta extends z.ZodTypeAny>(options: {
  type: TType;
  metadata: TMeta;
  list?: boolean;
}) {
  const base = {
    type: z.literal(options.type),
    userGameId: objectIdSchema,
    game: gameSnapshotSchema,
    metadata: options.metadata,
  };
  return z.object(
    options.list ? { ...base, list: listSnapshotSchema } : base,
  );
}

function listEvent<TType extends string, TMeta extends z.ZodTypeAny>(options: {
  type: TType;
  metadata: TMeta;
}) {
  return z.object({
    type: z.literal(options.type),
    list: listSnapshotSchema,
    metadata: options.metadata,
  });
}

export const activityEventSchema = z.discriminatedUnion("type", [
  gameEvent({
    type: "game.added",
    metadata: z.object({ source: z.enum(["manual", "atp"]) }).strict(),
  }),
  gameEvent({ type: "game.removed", metadata: emptyMetadata }),
  gameEvent({
    type: "game.status_changed",
    metadata: z
      .object({ from: statusEnum, to: statusEnum })
      .strict()
      .refine((data) => data.from !== data.to, {
        message: "from and to must differ",
      }),
  }),
  gameEvent({
    type: "game.finished",
    metadata: z.object({ timesFinished: z.number().int().min(1) }).strict(),
  }),
  gameEvent({
    type: "game.times_finished_changed",
    metadata: z
      .object({
        from: z.number().int().min(0),
        to: z.number().int().min(0),
      })
      .strict()
      .refine((data) => data.from !== data.to, {
        message: "from and to must differ",
      }),
  }),
  gameEvent({ type: "game.favorited", metadata: emptyMetadata }),
  gameEvent({ type: "game.unfavorited", metadata: emptyMetadata }),
  gameEvent({ type: "game.completed", metadata: emptyMetadata }),
  gameEvent({ type: "game.uncompleted", metadata: emptyMetadata }),
  gameEvent({
    type: "game.rating_changed",
    metadata: z
      .object({ from: ratingValue, to: ratingValue })
      .strict()
      .refine((data) => data.from !== data.to, {
        message: "from and to must differ",
      }),
  }),
  gameEvent({
    type: "game.hours_changed",
    metadata: z
      .object({
        from: z.number().min(0),
        to: z.number().min(0),
      })
      .strict()
      .refine((data) => data.from !== data.to, {
        message: "from and to must differ",
      }),
  }),
  gameEvent({
    type: "game.achievements_changed",
    metadata: z
      .object({ from: achievementsState, to: achievementsState })
      .strict()
      .refine((data) => JSON.stringify(data.from) !== JSON.stringify(data.to), {
        message: "from and to must differ",
      }),
  }),
  gameEvent({
    type: "note.created",
    metadata: z.object({ noteId: objectIdSchema }).strict(),
  }),
  gameEvent({ type: "game.added_to_list", metadata: emptyMetadata, list: true }),
  gameEvent({
    type: "game.removed_from_list",
    metadata: emptyMetadata,
    list: true,
  }),
  listEvent({ type: "list.created", metadata: emptyMetadata }),
  listEvent({
    type: "list.renamed",
    metadata: z
      .object({
        from: z.string().trim().min(1).max(100),
        to: z.string().trim().min(1).max(100),
      })
      .strict()
      .refine((data) => data.from !== data.to, {
        message: "from and to must differ",
      }),
  }),
  listEvent({
    type: "list.deleted",
    metadata: z.object({ memberCount: z.number().int().min(0) }).strict(),
  }),
  z.object({
    type: z.literal("top10.added"),
    userGameId: objectIdSchema,
    game: gameSnapshotSchema,
    metadata: z.object({ position: z.number().int().min(1).max(10) }).strict(),
  }),
  z.object({
    type: z.literal("top10.removed"),
    userGameId: objectIdSchema,
    game: gameSnapshotSchema,
    metadata: z
      .object({
        position: z.number().int().min(1).max(10),
        reason: z.enum(TOP10_REMOVE_REASONS),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("top10.reordered"),
    metadata: z
      .object({
        count: z.number().int().min(0).max(10),
        // Positional moves computed from the before/after order. Only
        // items present in both orders with a changed position; never
        // items added/removed by the same operation, never from === to.
        // Each move carries the same frozen game snapshot used everywhere
        // else, so history never needs the current catalog. `game` is
        // required for new events; tolerance for legacy events without it
        // lives only in the presentation layer, never here.
        moves: z
          .array(
            z
              .object({
                userGameId: objectIdSchema,
                from: z.number().int().min(1).max(10),
                to: z.number().int().min(1).max(10),
                game: gameSnapshotSchema,
              })
              .strict(),
          )
          .max(10),
      })
      .strict()
      .refine((data) => data.moves.every((move) => move.from !== move.to), {
        message: "moves must only contain changed positions",
      }),
  }),
]);

export type ActivityEventInput = z.infer<typeof activityEventSchema>;

/**
 * Validate a domain-built event before persistence. Throws
 * `VALIDATION_ERROR` on contract violations (missing fields, wrong
 * metadata shape, unknown type). Domain services call this, then pass
 * the result to `recordActivity` — never raw route input.
 */
export function parseActivityEvent(data: unknown): ActivityEventInput {
  const parsed = activityEventSchema.safeParse(data);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "value";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new ApiError("VALIDATION_ERROR", message);
  }
  return parsed.data;
}

export const listActivitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(ACTIVITY_TYPES).optional(),
  gameId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

export const activityIdParamSchema = z.object({
  activityId: objectIdSchema,
});

function isValidTimeZone(value: string): boolean {
  // Constructor-based check: accepts "UTC" (absent from
  // `supportedValuesOf` on some runtimes) and rejects unknown zones.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Feed read query: paginated by VISUAL FeedItems (`limit`), positioned by
 * opaque event cursor. Filters narrow the Mongo stream BEFORE grouping.
 */
export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().trim().min(1).max(512).optional(),
  timeZone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("UTC")
    .refine(isValidTimeZone, { message: "must be a valid IANA timezone" }),
  type: z.enum(ACTIVITY_TYPES).optional(),
  gameId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Diary text search (empty = no filter). Matched server-side against
  // game/list snapshot names and note contents; never raw user regex.
  q: z.string().trim().max(200).optional(),
}).refine(
  (data) =>
    data.from === undefined ||
    data.to === undefined ||
    data.from.getTime() <= data.to.getTime(),
  { message: "from must not be after to" },
);

export type FeedQuery = z.infer<typeof feedQuerySchema>;
