/**
 * Game-list read service. Reads only; mutations belong to Phase 5.
 */

import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { GameList, type GameListDocument } from "@/db/models/game-list";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame, type UserGameDocument } from "@/db/models/user-game";
import { parseActivityEvent } from "@/schemas/activity";
import { recordActivity } from "@/server/activity/service";
import { listGames, type PaginatedUserGame } from "@/server/games/service";
import type {
  ListGameListsQuery,
  ListGamesInListQuery,
} from "@/schemas/lists";
import {
  buildPaginatedResponse,
  pageOffset,
  type PaginatedResponse,
} from "@/server/shared/pagination";

export async function findOwnedListOrThrow(
  userId: string,
  listId: string,
): Promise<GameListDocument> {
  await connectDatabase();
  try {
    const list = await GameList.findOne({
      _id: listId,
      userId: new Types.ObjectId(userId),
    });
    if (!list) {
      throw new ApiError("LIST_NOT_FOUND", "Game list not found", 404);
    }
    return list;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_LIST_ID", "Invalid game list id", 400);
  }
}

export interface GameListWithCount {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  gameCount?: number;
}

/**
 * Minimal immutable snapshots for Activity events (same shape as the games
 * service helper, kept local to preserve module boundaries).
 */
function activitySnapshots(
  game: { name: string; cover?: string | null } | null,
  list: { _id: unknown; name: string } | null,
): {
  game: { name: string; cover?: string };
  list: { listId?: string; name: string };
} {
  return {
    game: game
      ? game.cover
        ? { name: game.name, cover: game.cover }
        : { name: game.name }
      : { name: "Unknown game" },
    list: list
      ? { listId: String(list._id), name: list.name }
      : { name: "Unknown list" },
  };
}

export async function listGameLists(
  userId: string,
  filters: ListGameListsQuery,
): Promise<PaginatedResponse<GameListWithCount>> {
  await connectDatabase();
  const query: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
  };
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.name = { $regex: escaped, $options: "i" };
  }

  const [total, lists] = await Promise.all([
    GameList.countDocuments(query),
    GameList.find(query)
      .sort({ name: 1 })
      .skip(pageOffset(filters))
      .limit(filters.limit),
  ]);

  let countsByListId = new Map<string, number>();
  if (filters.withCount && lists.length > 0) {
    const counts = await UserGame.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          listIds: { $in: lists.map((list) => list._id) },
        },
      },
      { $unwind: "$listIds" },
      { $match: { listIds: { $in: lists.map((list) => list._id) } } },
      { $group: { _id: "$listIds", count: { $sum: 1 } } },
    ]);
    countsByListId = new Map(
      counts.map((entry) => [String(entry._id), entry.count]),
    );
  }

  return buildPaginatedResponse(
    lists.map((list) => ({
      ...list.toObject(),
      ...(filters.withCount
        ? { gameCount: countsByListId.get(String(list._id)) ?? 0 }
        : {}),
    })),
    total,
    filters,
  );
}

export async function getGameList(
  userId: string,
  listId: string,
): Promise<GameListDocument> {
  return findOwnedListOrThrow(userId, listId);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

function duplicateListError(): ApiError {
  return new ApiError(
    "LIST_ALREADY_EXISTS",
    "A list with this name already exists",
    400,
  );
}

export async function createGameList(
  userId: string,
  input: { name: string },
): Promise<GameListDocument> {
  await connectDatabase();
  const existing = await GameList.findOne({
    userId: new Types.ObjectId(userId),
    name: input.name,
  });
  if (existing) {
    throw duplicateListError();
  }
  let created: GameListDocument;
  try {
    created = await GameList.create({ userId, name: input.name });
  } catch (error) {
    // Pre-check raced with another request; the unique {userId,name}
    // index is authoritative, and the contract stays LIST_ALREADY_EXISTS.
    if (isDuplicateKeyError(error)) {
      throw duplicateListError();
    }
    throw error;
  }
  // Activity Feed (best effort): recorded only after effective creation.
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "list.created",
      list: { listId: String(created._id), name: created.name },
      metadata: {},
    }),
  );
  return created;
}

export async function updateGameList(
  userId: string,
  listId: string,
  input: { name: string },
): Promise<GameListDocument> {
  const list = await findOwnedListOrThrow(userId, listId);
  const duplicate = await GameList.findOne({
    userId: new Types.ObjectId(userId),
    name: input.name,
    _id: { $ne: list._id },
  });
  if (duplicate) {
    throw duplicateListError();
  }
  const previousName = list.name;
  list.name = input.name;
  try {
    await list.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw duplicateListError();
    }
    throw error;
  }
  // Activity Feed (best effort): same-name rewrites are not real changes.
  if (input.name !== previousName) {
    await recordActivity(
      userId,
      parseActivityEvent({
        type: "list.renamed",
        list: { listId: String(list._id), name: list.name },
        metadata: { from: previousName, to: list.name },
      }),
    );
  }
  return list;
}

export async function deleteGameList(
  userId: string,
  listId: string,
): Promise<void> {
  const list = await findOwnedListOrThrow(userId, listId);
  // Member count BEFORE deletion: the memberships cease to exist after.
  const memberCount = await UserGame.countDocuments({
    userId: new Types.ObjectId(userId),
    listIds: list._id,
  });
  const snapshot = { listId: String(list._id), name: list.name };
  // The list label is removed and detached from the user's games.
  // UserGame and GlobalGame records are preserved.
  //
  // Consistency strategy (no Mongo transaction: the test runtime is a
  // standalone memory server, and both writes are single-user scoped):
  // detach FIRST, then delete the list. If the detach fails, nothing
  // changed. If the delete fails after a successful detach, the games are
  // merely untagged (visible under "Sem lista") and deleting again heals
  // the state — never orphaned references to a missing list.
  await UserGame.updateMany(
    { userId: new Types.ObjectId(userId), listIds: list._id },
    { $pull: { listIds: list._id } },
  );
  await list.deleteOne();
  // Activity Feed (best effort): recorded only after effective removal.
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "list.deleted",
      list: snapshot,
      metadata: { memberCount },
    }),
  );
}

export async function listGamesInList(
  userId: string,
  listId: string,
  filters: ListGamesInListQuery,
): Promise<PaginatedUserGame> {
  await findOwnedListOrThrow(userId, listId);
  return listGames(userId, { ...filters, listId });
}

async function findOwnedUserGameOrThrow(
  userId: string,
  gameId: string,
): Promise<UserGameDocument> {
  await connectDatabase();
  let userGame: UserGameDocument | null;
  try {
    userGame = await UserGame.findOne({
      _id: gameId,
      userId: new Types.ObjectId(userId),
    });
  } catch {
    throw new ApiError("INVALID_GAME_ID", "Invalid game id", 400);
  }
  if (!userGame) {
    throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
  }
  return userGame;
}

export async function addListToGame(
  userId: string,
  gameId: string,
  listId: string,
): Promise<void> {
  const list = await findOwnedListOrThrow(userId, listId);
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);

  // Idempotent: an existing membership is a no-op, not an error.
  const objectId = new Types.ObjectId(listId);
  if (userGame.listIds.some((id) => id.equals(objectId))) {
    return;
  }

  userGame.listIds.push(objectId);
  await userGame.save();

  // Activity Feed (best effort): only effective membership changes.
  const globalGame = await GlobalGame.findById(userGame.gameId);
  const snapshots = activitySnapshots(globalGame, {
    _id: list._id,
    name: list.name,
  });
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "game.added_to_list",
      userGameId: String(userGame._id),
      game: snapshots.game,
      list: snapshots.list,
      metadata: {},
    }),
  );
}

export async function removeListFromGame(
  userId: string,
  gameId: string,
  listId: string,
): Promise<void> {
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);
  const objectId = new Types.ObjectId(listId);
  // Idempotent removal; absence is not an error and emits no activity.
  // The explicit membership check avoids recording no-op removals.
  if (!userGame.listIds.some((id) => id.equals(objectId))) {
    return;
  }
  // Snapshots BEFORE removal: the list name must be resolved while the
  // membership still exists. A missing list keeps the previous lenient
  // behavior (the dangling reference is still pulled) but emits no event,
  // since the diary cannot name what no longer exists.
  const list = await GameList.findOne({
    _id: objectId,
    userId: new Types.ObjectId(userId),
  });
  const globalGame = await GlobalGame.findById(userGame.gameId);
  await userGame.updateOne({ $pull: { listIds: objectId } });
  if (!list) return;
  const snapshots = activitySnapshots(globalGame, {
    _id: list._id,
    name: list.name,
  });
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "game.removed_from_list",
      userGameId: String(userGame._id),
      game: snapshots.game,
      list: snapshots.list,
      metadata: {},
    }),
  );
}
