/**
 * Opaque cursor for Activity Feed pagination (pure, no I/O).
 *
 * The cursor is the last PHYSICAL event consumed by a page —
 * `{ createdAt, _id }` — never a visual FeedItem. Transport is
 * `base64url(JSON)`. Timezone is intentionally excluded: ordering and
 * pagination are physical (UTC); timezone only affects presentation.
 */

import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";

export interface ActivityCursor {
  createdAt: string;
  _id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function encodeCursor(cursor: { createdAt: string | Date; _id: string }): string {
  const createdAt =
    cursor.createdAt instanceof Date
      ? cursor.createdAt.toISOString()
      : cursor.createdAt;
  return Buffer.from(JSON.stringify({ createdAt, _id: cursor._id }), "utf8").toString(
    "base64url",
  );
}

/**
 * Strict decoding: malformed cursors are contract errors
 * (`VALIDATION_ERROR`), never silently treated as "first page".
 */
export function decodeCursor(raw: string): ActivityCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid pagination cursor");
  }
  if (!isRecord(parsed)) {
    throw new ApiError("VALIDATION_ERROR", "Invalid pagination cursor");
  }
  const { createdAt, _id } = parsed;
  if (
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt)) ||
    typeof _id !== "string" ||
    !Types.ObjectId.isValid(_id)
  ) {
    throw new ApiError("VALIDATION_ERROR", "Invalid pagination cursor");
  }
  return { createdAt, _id };
}

/**
 * Mongo filter fragment for "events strictly before the cursor" under
 * `createdAt DESC, _id DESC` ordering. Always combined with `userId` by
 * the caller — a foreign cursor can therefore never leak another user's
 * activities.
 */
export function cursorToMongoFilter(cursor: ActivityCursor): Record<string, unknown> {
  const createdAt = new Date(cursor.createdAt);
  return {
    $or: [
      { createdAt: { $lt: createdAt } },
      {
        createdAt,
        _id: { $lt: new Types.ObjectId(cursor._id) },
      },
    ],
  };
}
