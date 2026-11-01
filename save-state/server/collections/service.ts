/**
 * Game-collection service (Etapa 6 — migrated from server/lists).
 *
 * Same semantics as the legacy lists service: ownership-scoped CRUD,
 * idempotent attach/detach, detach-first delete preserving games.
 * Emits the new collection.* activity events.
 */

import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import {
  GameCollection,
  type GameCollectionDocument,
} from "@/db/models/game-collection";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame, type UserGameDocument } from "@/db/models/user-game";
import { parseActivityEvent } from "@/schemas/activity";
import { recordActivity } from "@/server/activity/service";
import { listGames, type PaginatedUserGame } from "@/server/games/service";
import type {
  CollectionGameCollectionsQuery,
  CollectionGamesInCollectionQuery,
} from "@/schemas/collections";
import {
  buildPaginatedResponse,
  pageOffset,
  type PaginatedResponse,
} from "@/server/shared/pagination";

export async function findOwnedCollectionOrThrow(
  userId: string,
  collectionId: string,
): Promise<GameCollectionDocument> {
  await connectDatabase();
  try {
    const collection = await GameCollection.findOne({
      _id: collectionId,
      userId: new Types.ObjectId(userId),
    });
    if (!collection) {
      throw new ApiError("LIST_NOT_FOUND", "Game collection not found", 404);
    }
    return collection;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_LIST_ID", "Invalid game collection id", 400);
  }
}

export interface GameCollectionWithCount {
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
  collection: { _id: unknown; name: string } | null,
): {
  game: { name: string; cover?: string };
  collection: { collectionId?: string; name: string };
} {
  return {
    game: game
      ? game.cover
        ? { name: game.name, cover: game.cover }
        : { name: game.name }
      : { name: "Unknown game" },
    collection: collection
      ? { collectionId: String(collection._id), name: collection.name }
      : { name: "Unknown collection" },
  };
}

export async function listGameCollections(
  userId: string,
  filters: CollectionGameCollectionsQuery,
): Promise<PaginatedResponse<GameCollectionWithCount>> {
  await connectDatabase();
  const query: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
  };
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.name = { $regex: escaped, $options: "i" };
  }

  const [total, collections] = await Promise.all([
    GameCollection.countDocuments(query),
    GameCollection.find(query)
      .sort({ name: 1 })
      .skip(pageOffset(filters))
      .limit(filters.limit),
  ]);

  let countsByCollectionId = new Map<string, number>();
  if (filters.withCount && collections.length > 0) {
    const counts = await UserGame.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          collectionIds: { $in: collections.map((collection) => collection._id) },
        },
      },
      { $unwind: "$collectionIds" },
      {
        $match: {
          collectionIds: { $in: collections.map((collection) => collection._id) },
        },
      },
      { $group: { _id: "$collectionIds", count: { $sum: 1 } } },
    ]);
    countsByCollectionId = new Map(
      counts.map((entry) => [String(entry._id), entry.count]),
    );
  }

  return buildPaginatedResponse(
    collections.map((collection) => ({
      ...collection.toObject(),
      ...(filters.withCount
        ? { gameCount: countsByCollectionId.get(String(collection._id)) ?? 0 }
        : {}),
    })),
    total,
    filters,
  );
}

export async function getGameCollection(
  userId: string,
  collectionId: string,
): Promise<GameCollectionDocument> {
  return findOwnedCollectionOrThrow(userId, collectionId);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

function duplicateCollectionError(): ApiError {
  return new ApiError(
    "LIST_ALREADY_EXISTS",
    "A collection with this name already exists",
    400,
  );
}

export async function createGameCollection(
  userId: string,
  input: { name: string },
): Promise<GameCollectionDocument> {
  await connectDatabase();
  const existing = await GameCollection.findOne({
    userId: new Types.ObjectId(userId),
    name: input.name,
  });
  if (existing) {
    throw duplicateCollectionError();
  }
  let created: GameCollectionDocument;
  try {
    created = await GameCollection.create({ userId, name: input.name });
  } catch (error) {
    // Pre-check raced with another request; the unique {userId,name}
    // index is authoritative, and the contract stays LIST_ALREADY_EXISTS.
    if (isDuplicateKeyError(error)) {
      throw duplicateCollectionError();
    }
    throw error;
  }
  // Activity Feed (best effort): recorded only after effective creation.
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "collection.created",
      collection: { collectionId: String(created._id), name: created.name },
      metadata: {},
    }),
  );
  return created;
}

export async function updateGameCollection(
  userId: string,
  collectionId: string,
  input: { name: string },
): Promise<GameCollectionDocument> {
  const collection = await findOwnedCollectionOrThrow(userId, collectionId);
  const duplicate = await GameCollection.findOne({
    userId: new Types.ObjectId(userId),
    name: input.name,
    _id: { $ne: collection._id },
  });
  if (duplicate) {
    throw duplicateCollectionError();
  }
  const previousName = collection.name;
  collection.name = input.name;
  try {
    await collection.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw duplicateCollectionError();
    }
    throw error;
  }
  // Activity Feed (best effort): same-name rewrites are not real changes.
  if (input.name !== previousName) {
    await recordActivity(
      userId,
      parseActivityEvent({
        type: "collection.renamed",
        collection: { collectionId: String(collection._id), name: collection.name },
        metadata: { from: previousName, to: collection.name },
      }),
    );
  }
  return collection;
}

export async function deleteGameCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  const collection = await findOwnedCollectionOrThrow(userId, collectionId);
  // Member count BEFORE deletion: the memberships cease to exist after.
  const memberCount = await UserGame.countDocuments({
    userId: new Types.ObjectId(userId),
    collectionIds: collection._id,
  });
  const snapshot = {
    collectionId: String(collection._id),
    name: collection.name,
  };
  // The collection label is removed and detached from the user's games.
  // UserGame and GlobalGame records are preserved.
  //
  // Consistency strategy (no Mongo transaction: the test runtime is a
  // standalone memory server, and both writes are single-user scoped):
  // detach FIRST, then delete the collection. If the detach fails, nothing
  // changed. If the delete fails after a successful detach, the games are
  // merely untagged (visible under "Sem coleção") and deleting again heals
  // the state — never orphaned references to a missing collection.
  await UserGame.updateMany(
    { userId: new Types.ObjectId(userId), collectionIds: collection._id },
    { $pull: { collectionIds: collection._id } },
  );
  await collection.deleteOne();
  // Activity Feed (best effort): recorded only after effective removal.
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "collection.deleted",
      collection: snapshot,
      metadata: { memberCount },
    }),
  );
}

export async function listGamesInCollection(
  userId: string,
  collectionId: string,
  filters: CollectionGamesInCollectionQuery,
): Promise<PaginatedUserGame> {
  await findOwnedCollectionOrThrow(userId, collectionId);
  return listGames(userId, { ...filters, collectionId });
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

export async function addCollectionToGame(
  userId: string,
  gameId: string,
  collectionId: string,
): Promise<void> {
  const collection = await findOwnedCollectionOrThrow(userId, collectionId);
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);

  // Idempotent: an existing membership is a no-op, not an error.
  const objectId = new Types.ObjectId(collectionId);
  if (userGame.collectionIds.some((id) => id.equals(objectId))) {
    return;
  }

  userGame.collectionIds.push(objectId);
  await userGame.save();

  // Activity Feed (best effort): only effective membership changes.
  const globalGame = await GlobalGame.findById(userGame.gameId);
  const snapshots = activitySnapshots(globalGame, {
    _id: collection._id,
    name: collection.name,
  });
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "game.added_to_collection",
      userGameId: String(userGame._id),
      game: snapshots.game,
      collection: snapshots.collection,
      metadata: {},
    }),
  );
}

export async function removeCollectionFromGame(
  userId: string,
  gameId: string,
  collectionId: string,
): Promise<void> {
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);
  const objectId = new Types.ObjectId(collectionId);
  // Idempotent removal; absence is not an error and emits no activity.
  // The explicit membership check avoids recording no-op removals.
  if (!userGame.collectionIds.some((id) => id.equals(objectId))) {
    return;
  }
  // Snapshots BEFORE removal: the collection name must be resolved while
  // the membership still exists. A missing collection keeps the previous
  // lenient behavior (the dangling reference is still pulled) but emits
  // no event, since the diary cannot name what no longer exists.
  const collection = await GameCollection.findOne({
    _id: objectId,
    userId: new Types.ObjectId(userId),
  });
  const globalGame = await GlobalGame.findById(userGame.gameId);
  await userGame.updateOne({ $pull: { collectionIds: objectId } });
  if (!collection) return;
  const snapshots = activitySnapshots(globalGame, {
    _id: collection._id,
    name: collection.name,
  });
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "game.removed_from_collection",
      userGameId: String(userGame._id),
      game: snapshots.game,
      collection: snapshots.collection,
      metadata: {},
    }),
  );
}
