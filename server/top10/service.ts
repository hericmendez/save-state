/**
 * Meu Top 10 service. Personal ordered ranking owned by the Save State user.
 *
 * Design notes:
 * - `User.top10` holds ordered UserGame ids; position in the array is the
 *   rank (index 0 → #1). No rank field lives on UserGame.
 * - All mutations validate ownership + `favorite === true` server-side.
 * - Writes use atomic MongoDB operators (`$push`/`$pull`/`$set` guarded by
 *   a filter) instead of read-modify-write of the whole User document, so
 *   concurrent adds cannot silently exceed 10 items or duplicate entries.
 * - Integrity removals (unfavorite, UserGame deletion) flow through
 *   `removeFromTop10` with an explicit reason — the Top 10 mutation owns
 *   its `top10.*` Activity events; games/lists services never emit them.
 */

import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";
import { User } from "@/db/models/user";
import { UserGame } from "@/db/models/user-game";
import {
  parseActivityEvent,
  type Top10RemoveReason,
} from "@/schemas/activity";
import { recordActivity } from "@/server/activity/service";
import type { UserGameWithGame } from "@/server/games/service";
import { TOP10_MAX_SIZE } from "@/schemas/top10";

function toObjectIdOrThrow(id: string): Types.ObjectId {
  try {
    return new Types.ObjectId(id);
  } catch {
    throw new ApiError("INVALID_GAME_ID", "Invalid game id", 400);
  }
}

/**
 * Minimal immutable game snapshot for Activity events. Resolved while the
 * UserGame is still available — never after a deletion.
 */
async function resolveGameSnapshot(
  gameId: unknown,
): Promise<{ name: string; cover?: string }> {
  const game = await GlobalGame.findById(gameId);
  if (!game) return { name: "Unknown game" };
  return game.cover ? { name: game.name, cover: game.cover } : { name: game.name };
}

async function findOwnedUserGameOrThrow(userId: string, userGameId: string) {
  const userGame = await UserGame.findOne({
    _id: toObjectIdOrThrow(userGameId),
    userId: new Types.ObjectId(userId),
  });
  if (!userGame) {
    const exists = await UserGame.findById(userGameId).lean().catch(
      () => null,
    );
    if (exists) {
      // Exists but belongs to another user: keep 404 ownership semantics
      // used by the games service (no cross-user leakage).
      throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
    }
    // Distinguish malformed (handled above) from missing.
    throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
  }
  return userGame;
}

export async function getTop10(userId: string): Promise<UserGameWithGame[]> {
  await connectDatabase();
  const user = await User.findById(userId).select("top10").lean();
  const orderedIds: string[] = (user?.top10 ?? []).map((id) => String(id));
  if (orderedIds.length === 0) return [];

  const userGames = await UserGame.find({
    _id: { $in: orderedIds.map((id) => new Types.ObjectId(id)) },
    userId: new Types.ObjectId(userId),
  }).populate("gameId");

  const byId = new Map(
    userGames.map((ug) => [String(ug._id), ug]),
  );
  const result: UserGameWithGame[] = [];
  for (const id of orderedIds) {
    const ug = byId.get(id);
    if (!ug) continue; // Defensive: hooks should prevent orphans.
    if (ug.favorite !== true) continue; // Defensive: unfavorite hook owns this.
      const obj = ug.toObject() as unknown as UserGameWithGame & { gameId: unknown };
    const game = (ug as unknown as { gameId: { _id?: unknown } }).gameId;
    // Populate may leave a bare ObjectId when GlobalGame is missing.
    if (!game || game instanceof Types.ObjectId) continue;
    result.push({ ...obj, game: game as UserGameWithGame["game"] });
  }
  return result;
}

export async function addToTop10(
  userId: string,
  userGameId: string,
): Promise<UserGameWithGame[]> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, userGameId);
  if (userGame.favorite !== true) {
    throw new ApiError(
      "TOP10_NOT_FAVORITE",
      "Only favorite games can enter the Top 10",
      400,
    );
  }

  const target = new Types.ObjectId(userGameId);
  const updated = await User.findOneAndUpdate(
    {
      _id: new Types.ObjectId(userId),
      top10: { $ne: target },
      $expr: { $lt: [{ $size: { $ifNull: ["$top10", []] } }, TOP10_MAX_SIZE] },
    },
    { $push: { top10: target } },
    { new: true, projection: { top10: 1 } },
  ).lean();

  if (updated) {
    // Activity Feed (best effort): one `top10.added` per effective insert.
    // Appends always land at the end, so the position is the new length.
    // No `top10.reordered` is emitted for the shift this may cause.
    await recordActivity(
      userId,
      parseActivityEvent({
        type: "top10.added",
        userGameId: String(userGame._id),
        game: await resolveGameSnapshot(userGame.gameId),
        metadata: { position: updated.top10.length },
      }),
    );
    return getTop10(userId);
  }

  // Atomic guard rejected: determine why for a precise contract error.
  const current = await User.findById(userId).select("top10").lean();
  const ids = (current?.top10 ?? []).map((id) => String(id));
  if (ids.includes(userGameId)) {
    throw new ApiError(
      "TOP10_DUPLICATE",
      "Game is already in the Top 10",
      400,
    );
  }
  if (ids.length >= TOP10_MAX_SIZE) {
    throw new ApiError(
      "TOP10_FULL",
      "Top 10 already has 10 games",
      400,
    );
  }
  // Extremely unlikely fallback (user deleted between checks).
  throw new ApiError("USER_NOT_FOUND", "User not found", 404);
}

/**
 * Remove a UserGame reference from its owner's Top 10.
 *
 * The reason is always explicit — never inferred afterwards:
 * - `"manual"`: direct `DELETE /api/top10/:id` (route default);
 * - `"unfavorited"`: `updateGame` favorite true → false;
 * - `"game_deleted"`: `deleteGame` cascade (callers pass a pre-captured
 *   snapshot because the UserGame no longer exists at call time).
 *
 * Idempotent removal (same convention as list membership removal):
 * absence is a no-op returning 204, never an error — and emits no event.
 */
export async function removeFromTop10(
  userId: string,
  userGameId: string,
  reason: Top10RemoveReason = "manual",
  snapshot?: { name: string; cover?: string },
): Promise<void> {
  await connectDatabase();
  const user = await User.findById(userId).select("top10").lean();
  const index = (user?.top10 ?? []).map(String).indexOf(userGameId);
  await User.updateOne(
    { _id: toObjectIdOrThrow(userId) },
    { $pull: { top10: toObjectIdOrThrow(userGameId) } },
  );
  if (index === -1) return;
  // Activity Feed (best effort): only effective removals, with the
  // position occupied before the pull and the explicit reason.
  const game =
    snapshot ??
    (await UserGame.findOne({
      _id: toObjectIdOrThrow(userGameId),
      userId: new Types.ObjectId(userId),
    })
      .select("gameId")
      .lean()
      .then((owned) => resolveGameSnapshot(owned?.gameId)));
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "top10.removed",
      userGameId,
      game,
      metadata: { position: index + 1, reason },
    }),
  );
}

export async function reorderTop10(
  userId: string,
  orderedIds: string[],
): Promise<UserGameWithGame[]> {
  await connectDatabase();
  if (orderedIds.length > TOP10_MAX_SIZE) {
    throw new ApiError("TOP10_FULL", "Top 10 cannot have more than 10 games", 400);
  }
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new ApiError(
        "TOP10_DUPLICATE",
        "Top 10 cannot contain duplicate games",
        400,
      );
    }
    seen.add(id);
    try {
      new Types.ObjectId(id);
    } catch {
      throw new ApiError("INVALID_GAME_ID", "Invalid game id", 400);
    }
  }

  if (orderedIds.length > 0) {
    const found = await UserGame.find({
      _id: { $in: orderedIds.map((id) => new Types.ObjectId(id)) },
      userId: new Types.ObjectId(userId),
    }).select("_id favorite");
    if (found.length !== orderedIds.length) {
      throw new ApiError(
        "GAME_NOT_FOUND",
        "One or more games were not found",
        404,
      );
    }
    const notFavorite = found.find((ug) => ug.favorite !== true);
    if (notFavorite) {
      throw new ApiError(
        "TOP10_NOT_FAVORITE",
        "Only favorite games can be in the Top 10",
        400,
      );
    }
  }

  const before = await User.findById(userId).select("top10").lean();
  const beforeIds = (before?.top10 ?? []).map(String);
  const changed =
    beforeIds.length !== orderedIds.length ||
    beforeIds.some((id, index) => id !== orderedIds[index]);

  await User.updateOne(
    { _id: new Types.ObjectId(userId) },
    {
      $set: {
        top10: orderedIds.map((id) => new Types.ObjectId(id)),
      },
    },
  );
  // Activity Feed (best effort): exactly one summary event per effective
  // reorder — never per item, never alongside added/removed, and nothing
  // when the order did not actually change. `moves` carries only items
  // present in both orders whose position changed, each with the game
  // snapshot frozen during this mutation (never resolved afterwards).
  if (changed) {
    const movedIds = orderedIds.filter((id, index) => {
      const fromIndex = beforeIds.indexOf(id);
      return fromIndex !== -1 && fromIndex !== index;
    });
    const movedGames = await UserGame.find({
      _id: { $in: movedIds.map((id) => new Types.ObjectId(id)) },
      userId: new Types.ObjectId(userId),
    })
      .select("gameId")
      .populate("gameId");
    const snapshotById = new Map<string, { name: string; cover?: string }>();
    for (const userGame of movedGames) {
      const game = userGame.gameId as unknown as {
        name?: unknown;
        cover?: unknown;
      } | null;
      snapshotById.set(
        String(userGame._id),
        typeof game?.name === "string"
          ? typeof game.cover === "string" && game.cover.length > 0
            ? { name: game.name, cover: game.cover }
            : { name: game.name }
          : { name: "Unknown game" },
      );
    }
    const moves = orderedIds.flatMap((id, index) => {
      const fromIndex = beforeIds.indexOf(id);
      if (fromIndex === -1 || fromIndex === index) return [];
      return [
        {
          userGameId: id,
          from: fromIndex + 1,
          to: index + 1,
          game: snapshotById.get(id) ?? { name: "Unknown game" },
        },
      ];
    });
    await recordActivity(
      userId,
      parseActivityEvent({
        type: "top10.reordered",
        metadata: { count: orderedIds.length, moves },
      }),
    );
  }
  return getTop10(userId);
}

export async function getTop10Candidates(
  userId: string,
): Promise<UserGameWithGame[]> {
  await connectDatabase();
  const user = await User.findById(userId).select("top10").lean();
  const excluded = new Set((user?.top10 ?? []).map((id) => String(id)));
  const favorites = await UserGame.find({
    userId: new Types.ObjectId(userId),
    favorite: true,
  })
    .sort({ updatedAt: -1 })
    .populate("gameId");
  return favorites
    .filter((ug) => !excluded.has(String(ug._id)))
    .map((ug) => {
    const obj = ug.toObject() as unknown as UserGameWithGame & { gameId: unknown };
      return {
        ...obj,
        game: (ug as unknown as { gameId: UserGameWithGame["game"] }).gameId,
      };
    });
}

