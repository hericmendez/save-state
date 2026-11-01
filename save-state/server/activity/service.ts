/**
 * Activity Feed persistence helper (foundation only — no reads yet).
 *
 * The Activity Feed is a best-effort diary, not Event Sourcing. Failures of
 * persistence are absorbed after being recorded in the logger; errors of
 * contract/validation are not treated as normal persistence failures.
 *
 * Intended flow:
 *
 * ```text
 * domain service (decides WHAT happened, validates via parseActivityEvent)
 *     ↓
 * recordActivity(userId, validatedEvent) — persistence only
 *     ↓
 * Activity.create()
 * ```
 *
 * - Validation is mandatory and happens BEFORE this helper (Zod, throws
 *   `VALIDATION_ERROR` on violations so contract bugs surface in dev/test).
 * - Persistence is best effort: `Activity.create()` runs inside the only
 *   `try/catch` here. On failure the error is logged (with `userId` and
 *   `type` for diagnosis) and `null` is returned — the caller's mutation
 *   must continue as if the diary write never happened.
 * - No transactions, no retry/outbox in this feature (explicit decision).
 * - Never called by Route Handlers directly — only by domain services,
 *   after their primary mutation has succeeded.
 */

import "server-only";
import { Types } from "mongoose";
import { connectDatabase } from "@/db/connection";
import { Activity, type ActivityDocument } from "@/db/models/activity";
import { UserGameNote } from "@/db/models/user-game-note";
import type {
  ActivityEventInput,
  FeedQuery,
} from "@/schemas/activity";
import {
  canExtendGroup,
  groupActivities,
  type ActivityEventDTO,
  type FeedItem,
} from "@/features/activity/grouping";
import { logger } from "@/server/shared/logger";
import {
  cursorToMongoFilter,
  decodeCursor,
  encodeCursor,
} from "./cursor";

export async function recordActivity(
  userId: string,
  event: ActivityEventInput,
): Promise<ActivityDocument | null> {
  await connectDatabase();
  try {
    return await Activity.create({ userId, ...event });
  } catch (error) {
    logger.error("Failed to record activity", {
      userId,
      type: event.type,
      name: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

export interface ActivityDTO {
  _id: string;
  userGameId?: string;
  game?: { name: string; cover?: string | null };
  list?: { listId?: string; name: string };
  collection?: { collectionId?: string; name: string };
  metadata: Record<string, unknown>;
  createdAt: string;
  type: string;
}

export interface FeedItemDTO {
  kind: "group" | "single";
  title: string;
  count: number;
  span: { from: string; to: string };
  members: ActivityDTO[];
  expanded: Array<{ time: string; text: string; cover?: string }>;
  canExpand: boolean;
}

export interface FeedPage {
  data: FeedItemDTO[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

/** Read batch size for the overfetch loop (internal, not a page unit). */
const FEED_BATCH_SIZE = 100;

/**
 * Operational telemetry threshold: crossing it only logs a warning.
 * It NEVER truncates a group — boundary integrity outranks scan cost.
 */
const FEED_SCAN_WARN_THRESHOLD = 2000;

interface StoredEvent {
  _id: Types.ObjectId;
  type: string;
  userGameId?: Types.ObjectId;
  game?: { name: string; cover?: string };
  list?: { listId?: string; name: string };
  collection?: { collectionId?: string; name: string };
  metadata: Record<string, unknown>;
  createdAt: Date;
}

function toEventDTO(doc: StoredEvent): ActivityEventDTO {
  return {
    _id: String(doc._id),
    type: doc.type,
    ...(doc.userGameId ? { userGameId: String(doc.userGameId) } : {}),
    ...(doc.game ? { game: { ...doc.game } } : {}),
    ...(doc.list
      ? {
          list: {
            ...(doc.list.listId ? { listId: String(doc.list.listId) } : {}),
            name: doc.list.name,
          },
        }
      : {}),
    ...(doc.collection
      ? {
          collection: {
            ...(doc.collection.collectionId
              ? { collectionId: String(doc.collection.collectionId) }
              : {}),
            name: doc.collection.name,
          },
        }
      : {}),
    metadata: { ...(doc.metadata ?? {}) },
    createdAt: doc.createdAt,
  };
}

function toFeedItemDTO(item: FeedItem): FeedItemDTO {
  return {
    kind: item.kind,
    title: item.title,
    count: item.count,
    span: {
      from: item.span.from.toISOString(),
      to: item.span.to.toISOString(),
    },
    members: item.members.map((member) => ({
      _id: member._id,
      type: member.type,
      ...(member.userGameId ? { userGameId: member.userGameId } : {}),
      ...(member.game ? { game: { ...member.game } } : {}),
      ...(member.list ? { list: { ...member.list } } : {}),
      ...(member.collection ? { collection: { ...member.collection } } : {}),
      metadata: { ...member.metadata },
      createdAt:
        member.createdAt instanceof Date
          ? member.createdAt.toISOString()
          : member.createdAt,
    })),
    expanded: item.expanded.map((line) => ({ ...line })),
    canExpand: item.canExpand,
  };
}

/**
 * Boundary-safe feed read.
 *
 * Pages count VISUAL FeedItems while the cursor tracks the last PHYSICAL
 * event consumed. The loop accumulates events, regroups, and only closes
 * the page when it holds `limit` items with a closed trailing item
 * (verified with one peek event reusing `canExtendGroup`) or when events
 * run out. Oversized groups always complete whole — never split.
 */
export async function listFeed(userId: string, query: FeedQuery): Promise<FeedPage> {
  await connectDatabase();
  const userObjectId = new Types.ObjectId(userId);
  const baseFilter: Record<string, unknown> = { userId: userObjectId };
  if (query.type !== undefined) baseFilter.type = query.type;
  if (query.gameId !== undefined) {
    baseFilter.userGameId = new Types.ObjectId(query.gameId);
  }
  if (query.from !== undefined || query.to !== undefined) {
    const range: Record<string, Date> = {};
    if (query.from !== undefined) range.$gte = query.from;
    if (query.to !== undefined) range.$lte = query.to;
    baseFilter.createdAt = range;
  }
  // Diary text search (case-insensitive partial, user regex escaped):
  // snapshot names match in-DB; note contents resolve via the note's own
  // user-scoped query (no denormalization into Activity). A deleted note
  // simply stops matching — its event stays untouched.
  if (query.q !== undefined && query.q !== "") {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const contentMatch = { $regex: escaped, $options: "i" };
    const matchingNotes = await UserGameNote.find({
      userId: userObjectId,
      content: contentMatch,
    })
      .select("_id")
      .lean();
    const clauses: Record<string, unknown>[] = [
      { "game.name": contentMatch },
      { "list.name": contentMatch },
      { "collection.name": contentMatch },
      {
        type: "note.created",
        "metadata.noteId": {
          $in: matchingNotes.map((note) => String(note._id)),
        },
      },
    ];
    const existing = baseFilter.$and;
    baseFilter.$and = [
      ...(Array.isArray(existing) ? existing : []),
      { $or: clauses },
    ];
  }

  const matchesAfter = (last: StoredEvent): Record<string, unknown> => ({
    $and: [
      baseFilter,
      {
        $or: [
          { createdAt: { $lt: last.createdAt } },
          { createdAt: last.createdAt, _id: { $lt: last._id } },
        ],
      },
    ],
  });

  const afterCursor = (): Record<string, unknown> => {
    if (query.cursor !== undefined) {
      // Strict cursor: malformed positions are contract errors, unknown
      // but well-formed positions are valid pagination positions.
      return {
        $and: [baseFilter, cursorToMongoFilter(decodeCursor(query.cursor))],
      };
    }
    return baseFilter;
  };

  let consumed: StoredEvent[] = [];
  let exhausted = false;
  let scanned = 0;

  while (true) {
    const last = consumed.length > 0 ? consumed[consumed.length - 1] : null;
    const batch = await Activity.find(last ? matchesAfter(last) : afterCursor())
      .sort({ createdAt: -1, _id: -1 })
      .limit(FEED_BATCH_SIZE)
      .lean<StoredEvent[]>();
    if (batch.length === 0) {
      exhausted = true;
      break;
    }
    consumed = consumed.concat(batch);
    scanned += batch.length;
    if (scanned >= FEED_SCAN_WARN_THRESHOLD) {
      logger.warn("Activity feed scan exceeded warn threshold", {
        userId,
        scanned,
      });
    }
    if (batch.length < FEED_BATCH_SIZE) {
      // Partial batch: the stream is exhausted, no peek needed.
      exhausted = true;
      break;
    }
    const items = groupActivities(consumed.map(toEventDTO), {
      timeZone: query.timeZone,
    });
    if (items.length < query.limit) continue;
    // Closure check: exactly one peek beyond the consumed events.
    const peek = await Activity.findOne(matchesAfter(consumed[consumed.length - 1]))
      .sort({ createdAt: -1, _id: -1 })
      .lean<StoredEvent | null>();
    if (!peek) {
      exhausted = true;
      break;
    }
    const trailing = items[items.length - 1];
    const lastMember = trailing.members[trailing.members.length - 1];
    if (canExtendGroup(lastMember, toEventDTO(peek), query.timeZone)) {
      continue;
    }
    break;
  }

  const items = groupActivities(consumed.map(toEventDTO), {
    timeZone: query.timeZone,
  });
  const page = items.slice(0, query.limit);
  const consumedForPage = page.flatMap((item) =>
    item.members.map((member) => member._id),
  );
  // Re-derive consumed events per emitted item to keep the cursor exact:
  // only events backing emitted items count as consumed.
  const emittedCount = consumedForPage.length;
  const lastConsumed =
    emittedCount > 0 ? consumed[emittedCount - 1] : null;

  let hasMore: boolean;
  let nextCursor: string | null;
  if (!lastConsumed) {
    hasMore = false;
    nextCursor = null;
  } else if (exhausted && emittedCount >= consumed.length) {
    hasMore = false;
    nextCursor = null;
  } else {
    hasMore = true;
    nextCursor = encodeCursor({
      createdAt: lastConsumed.createdAt,
      _id: String(lastConsumed._id),
    });
  }

  return {
    data: page.map(toFeedItemDTO),
    pagination: { limit: query.limit, hasMore, nextCursor },
  };
}
