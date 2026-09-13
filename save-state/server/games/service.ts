/**
 * Game read service. Callable directly by Server Components and by
 * read Route Handlers — both share this module, never HTTP between them.
 *
 * Reads only. Mutations belong to Phase 5.
 */

import "server-only";
import type { FilterQuery } from "mongoose";
import { Types } from "mongoose";
import slugify from "slugify";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { GlobalGame, type GlobalGameDocument } from "@/db/models/global-game";
import { UserGame, type UserGameDocument } from "@/db/models/user-game";
import type {
  CreateGameInput,
  ListGamesQuery,
  UpdateGameInput,
} from "@/schemas/games";
import {
  buildPaginatedResponse,
  pageOffset,
  type PaginatedResponse,
} from "@/server/shared/pagination";

export type GameQuery = Omit<ListGamesQuery, "page" | "limit">;

export interface UserGameWithGame {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: string;
  hoursPlayed: number;
  timesFinished: number;
  rating?: number | null;
  review?: string | null;
  listIds: Types.ObjectId[];
  favorite: boolean;
  finished: boolean;
  fullyCompleted: boolean;
  achievements: boolean;
  achievementProgress?: number | null;
  achievementsCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  game: GlobalGameDocument;
}

function deriveFinished(timesFinished: number): boolean {
  return timesFinished > 0;
}

function deriveAchievementsCompleted(
  achievements: boolean,
  achievementProgress?: number | null,
): boolean {
  return achievements === true && achievementProgress === 100;
}

function normalizeAchievements(
  achievements?: boolean,
  achievementProgress?: number | null,
): { achievements?: boolean; achievementProgress?: number | null; achievementsCompleted?: boolean } {
  if (achievements === false) {
    return {
      achievements: false,
      achievementProgress: undefined,
      achievementsCompleted: false,
    };
  }
  if (achievements === true) {
    const completed = achievementProgress === 100;
    return {
      achievements: true,
      achievementProgress: achievementProgress ?? undefined,
      achievementsCompleted: completed,
    };
  }
  if (achievementProgress !== undefined) {
    if (achievementProgress === null) {
      return { achievementProgress: undefined, achievementsCompleted: false };
    }
    return {
      achievementProgress,
      achievementsCompleted: achievementProgress === 100,
    };
  }
  return {};
}

export type PaginatedUserGame = PaginatedResponse<UserGameWithGame>;

function buildFilters(
  userId: string,
  filters: GameQuery,
): FilterQuery<UserGameDocument> {
  const query: FilterQuery<UserGameDocument> = {
    userId: new Types.ObjectId(userId),
  };

  if (filters.listId) {
    query.listIds = new Types.ObjectId(filters.listId);
  }
  if (filters.hoursPlayedMin !== undefined || filters.hoursPlayedMax !== undefined) {
    query.hoursPlayed = {};
    if (filters.hoursPlayedMin !== undefined) {
      query.hoursPlayed.$gte = filters.hoursPlayedMin;
    }
    if (filters.hoursPlayedMax !== undefined) {
      query.hoursPlayed.$lte = filters.hoursPlayedMax;
    }
  }
  if (
    filters.timesFinishedMin !== undefined ||
    filters.timesFinishedMax !== undefined
  ) {
    query.timesFinished = {};
    if (filters.timesFinishedMin !== undefined) {
      query.timesFinished.$gte = filters.timesFinishedMin;
    }
    if (filters.timesFinishedMax !== undefined) {
      query.timesFinished.$lte = filters.timesFinishedMax;
    }
  }
  if (filters.ratingMin !== undefined || filters.ratingMax !== undefined) {
    query.rating = {};
    if (filters.ratingMin !== undefined) {
      query.rating.$gte = filters.ratingMin;
    }
    if (filters.ratingMax !== undefined) {
      query.rating.$lte = filters.ratingMax;
    }
  }
  if (filters.favorite !== undefined) {
    query.favorite = filters.favorite;
  }
  if (filters.finished !== undefined) {
    query.finished = filters.finished;
  }
  if (filters.fullyCompleted !== undefined) {
    query.fullyCompleted = filters.fullyCompleted;
  }
  if (filters.achievements !== undefined) {
    query.achievements = filters.achievements;
  }
  if (filters.achievementsCompleted !== undefined) {
    query.achievementsCompleted = filters.achievementsCompleted;
  }

  return query;
}

function buildGlobalGameFilters(
  filters: GameQuery,
): FilterQuery<GlobalGameDocument> {
  const query: FilterQuery<GlobalGameDocument> = {};

  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.name = { $regex: escaped, $options: "i" };
  }
  for (const field of ["genre", "platform", "developer", "publisher"] as const) {
    const value = filters[field];
    if (value !== undefined) {
      const plural = `${field}s` as
        | "genres"
        | "platforms"
        | "developers"
        | "publishers";
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query[plural] = { $regex: `^${escaped}$`, $options: "i" };
    }
  }
  if (filters.releaseDateFrom !== undefined || filters.releaseDateTo !== undefined) {
    query.releaseDate = {};
    if (filters.releaseDateFrom !== undefined) {
      query.releaseDate.$gte = filters.releaseDateFrom;
    }
    if (filters.releaseDateTo !== undefined) {
      query.releaseDate.$lte = filters.releaseDateTo;
    }
  }

  return query;
}

async function findOwnedUserGameOrThrow(
  userId: string,
  gameId: string,
): Promise<UserGameDocument> {
  let userGame: UserGameDocument | null = null;
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

export async function resolveGameQuery(
  userId: string,
  filters: GameQuery,
): Promise<FilterQuery<UserGameDocument>> {
  await connectDatabase();
  const globalFilter = buildGlobalGameFilters(filters);
  let matchingGameIds: Types.ObjectId[] | null = null;

  if (Object.keys(globalFilter).length > 0) {
    const games = await GlobalGame.find(globalFilter).select("_id");
    matchingGameIds = games.map((game) => game._id as Types.ObjectId);
  }

  const query = buildFilters(userId, filters);
  if (matchingGameIds) {
    query.gameId = { $in: matchingGameIds };
  }
  return query;
}

export async function listGames(
  userId: string,
  filters: ListGamesQuery,
): Promise<PaginatedUserGame> {
  const query = await resolveGameQuery(userId, filters);

  const [total, userGames] = await Promise.all([
    UserGame.countDocuments(query),
    UserGame.find(query)
      .sort({ updatedAt: -1 })
      .skip(pageOffset(filters))
      .limit(filters.limit)
      .populate<{ gameId: GlobalGameDocument | null }>("gameId"),
  ]);

  return buildPaginatedResponse(
    userGames.map((userGame) => ({
      ...userGame.toObject(),
      game: userGame.gameId!,
    })),
    total,
    filters,
  );
}

export async function getGame(
  userId: string,
  gameId: string,
): Promise<UserGameWithGame> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);
  const game = await GlobalGame.findById(userGame.gameId);
  if (!game) {
    throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
  }
  return { ...userGame.toObject(), game };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

export async function createGame(input: {
  userId: string;
} & CreateGameInput): Promise<UserGameWithGame> {
  await connectDatabase();
  let globalGame: GlobalGameDocument | null;

  if (input.gameId) {
    globalGame = await GlobalGame.findById(input.gameId);
    if (!globalGame) {
      throw new ApiError(
        "GAME_NOT_FOUND",
        "Referenced game does not exist",
        400,
      );
    }
  } else if (input.game) {
    const existing = await GlobalGame.findOne({
      name: input.game.name,
      source: "manual",
    });
    globalGame =
      existing ??
      (await GlobalGame.create({
        slug: `${slugify(input.game.name, { lower: true, strict: true })}-${Date.now()}`,
        name: input.game.name,
        source: "manual",
        cover: input.game.cover,
        genres: input.game.genres ?? [],
        platforms: input.game.platforms ?? [],
        developers: input.game.developers ?? [],
        publishers: input.game.publishers ?? [],
        releaseDate: input.game.releaseDate,
        summary: input.game.summary,
      }).catch(async (error: unknown) => {
        // Concurrent creation raced with another request; the unique
        // partial index on {name} for manual games resolves the winner.
        if (isDuplicateKeyError(error)) {
          const winner = await GlobalGame.findOne({
            name: input.game?.name,
            source: "manual",
          });
          if (winner) return winner;
        }
        throw error;
      }));
  } else {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Either gameId or game is required",
      400,
    );
  }

  let userGame: UserGameDocument;
  try {
    const timesFinished = input.timesFinished ?? 0;
    const finished = deriveFinished(timesFinished);
    const achNorm = normalizeAchievements(
      input.achievements,
      input.achievementProgress ?? undefined,
    );
    userGame = await UserGame.create({
      userId: input.userId,
      gameId: globalGame._id,
      status: input.status,
      hoursPlayed: input.hoursPlayed,
      timesFinished,
      rating: input.rating,
      review: input.review,
      favorite: input.favorite ?? false,
      finished,
      fullyCompleted: input.fullyCompleted ?? false,
      achievements: achNorm.achievements ?? input.achievements ?? false,
      achievementProgress: achNorm.achievementProgress,
      achievementsCompleted: achNorm.achievementsCompleted ?? false,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ApiError(
        "GAME_ALREADY_IN_LIBRARY",
        "This game is already in your library",
        400,
      );
    }
    throw error;
  }

  return { ...userGame.toObject(), game: globalGame };
}

export async function updateGame(
  userId: string,
  gameId: string,
  input: UpdateGameInput,
): Promise<UserGameWithGame> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);

  const personalUpdates: Record<string, unknown> = {};
  for (const field of [
    "status",
    "hoursPlayed",
    "rating",
    "review",
    "favorite",
    "fullyCompleted",
  ] as const) {
    if (input[field] !== undefined) {
      personalUpdates[field] = input[field];
    }
  }
  if (input.timesFinished !== undefined) {
    personalUpdates.timesFinished = input.timesFinished;
    personalUpdates.finished = deriveFinished(input.timesFinished);
  }
  if (
    input.achievements !== undefined ||
    input.achievementProgress !== undefined
  ) {
    const nextAchievements =
      input.achievements !== undefined
        ? input.achievements
        : userGame.achievements;
    const nextProgressRaw =
      input.achievementProgress !== undefined
        ? input.achievementProgress
        : userGame.achievementProgress;
    const nextProgress =
      input.achievementProgress === null ? undefined : nextProgressRaw ?? undefined;
    const norm = normalizeAchievements(
      nextAchievements,
      nextProgress as number | null | undefined,
    );
    if (input.achievements !== undefined) {
      personalUpdates.achievements = norm.achievements;
    }
    if (input.achievementProgress !== undefined) {
      personalUpdates.achievementProgress = norm.achievementProgress;
      // Prepare document for $unset when clearing
      if (norm.achievementProgress === undefined) {
        userGame.achievementProgress = undefined as unknown as number;
      }
    } else if (input.achievements === false) {
      personalUpdates.achievementProgress = undefined;
      userGame.achievementProgress = undefined as unknown as number;
    }
    personalUpdates.achievementsCompleted = norm.achievementsCompleted ?? false;
  }
  Object.assign(userGame, personalUpdates);
  // Ensure achievementProgress unset is applied when cleared via achievements=false or null progress
  if (
    personalUpdates.achievementProgress === undefined &&
    (input.achievementProgress === null || input.achievements === false)
  ) {
    (userGame as unknown as { achievementProgress?: unknown }).achievementProgress = undefined;
  }
  await userGame.save();

  if (input.game && Object.keys(input.game).length > 0) {
    const globalGame = await GlobalGame.findById(userGame.gameId);
    if (!globalGame || globalGame.source !== "manual") {
      throw new ApiError(
        "GAME_METADATA_IMMUTABLE",
        "Metadata can only be edited on manually created games",
        400,
      );
    }
    const metadata = input.game;
    if (metadata.name !== undefined) globalGame.name = metadata.name;
    if (metadata.cover !== undefined) globalGame.cover = metadata.cover;
    if (metadata.genres !== undefined) globalGame.genres = metadata.genres;
    if (metadata.platforms !== undefined)
      globalGame.platforms = metadata.platforms;
    if (metadata.developers !== undefined)
      globalGame.developers = metadata.developers;
    if (metadata.publishers !== undefined)
      globalGame.publishers = metadata.publishers;
    if (metadata.releaseDate !== undefined) {
      globalGame.releaseDate = metadata.releaseDate ?? undefined;
    }
    if (metadata.summary !== undefined) globalGame.summary = metadata.summary;
    await globalGame.save();
  }

  const game = await GlobalGame.findById(userGame.gameId);
  return { ...userGame.toObject(), game: game! };
}

export async function incrementTimesFinished(
  userId: string,
  gameId: string,
): Promise<UserGameWithGame> {
  await connectDatabase();
  const updated = await UserGame.findOneAndUpdate(
    { _id: new Types.ObjectId(gameId), userId: new Types.ObjectId(userId) },
    { $inc: { timesFinished: 1 }, $set: { finished: true } },
    { new: true },
  );
  if (!updated) {
    // Distinguish invalid id vs not found: try to detect malformed id
    try {
      new Types.ObjectId(gameId);
    } catch {
      throw new ApiError("INVALID_GAME_ID", "Invalid game id", 400);
    }
    // Check if exists for another user to preserve 404 semantics
    const exists = await UserGame.findById(gameId).lean();
    if (!exists) {
      throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
    }
    throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
  }
  const game = await GlobalGame.findById(updated.gameId);
  if (!game) {
    throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
  }
  return { ...updated.toObject(), game };
}

export async function deleteGame(
  userId: string,
  gameId: string,
): Promise<void> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);
  // Only the user's relationship is removed. The shared GlobalGame record
  // is preserved, and list references die with the UserGame document.
  await userGame.deleteOne();
}
