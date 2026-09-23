/**
 * Game read service. Callable directly by Server Components and by
 * read Route Handlers — both share this module, never HTTP between them.
 *
 * Reads only. Mutations belong to Phase 5.
 */

import "server-only";
import type { FilterQuery, PipelineStage } from "mongoose";
import { Types } from "mongoose";
import slugify from "slugify";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { GlobalGame, type GlobalGameDocument } from "@/db/models/global-game";
import { UserGame, type UserGameDocument } from "@/db/models/user-game";
import { UserGameNote } from "@/db/models/user-game-note";
import { parseActivityEvent } from "@/schemas/activity";
import { recordActivity } from "@/server/activity/service";
import { removeFromTop10 } from "@/server/top10/service";
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

/**
 * Minimal immutable game snapshot for Activity events.
 * The diary freezes `{ name, cover }` at event time so future catalog
 * changes can never rewrite history.
 */
function gameActivitySnapshot(game: {
  name: string;
  cover?: string | null;
}): { name: string; cover?: string } {
  return game.cover ? { name: game.name, cover: game.cover } : { name: game.name };
}

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
  if (filters.withoutList === true) {
    // Derived "Sem lista" view: listIds.length === 0. This is not the
    // absence of a listId filter. When combined with listId (a
    // contradictory request: "in list X" AND "in no list"), all library
    // filters stay conjunctive and the result is intentionally empty —
    // the same way any other impossible combination behaves. No silent
    // precedence, no validation error: list context simply narrows.
    if (filters.listId) {
      query.$and = [
        ...(query.$and ?? []),
        { listIds: query.listIds },
        { listIds: { $size: 0 } },
      ];
      delete query.listIds;
    } else {
      query.listIds = { $size: 0 };
    }
  }
  if (filters.status !== undefined) {
    query.status = filters.status;
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
  // Library year filters reuse the stored releaseDate: yearFrom means
  // year >= value and yearTo means year <= value. Bounds merge with (never
  // widen) explicit releaseDateFrom/To when both are present.
  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
    const lower = filters.yearFrom !== undefined
      ? new Date(Date.UTC(filters.yearFrom, 0, 1))
      : undefined;
    const upper = filters.yearTo !== undefined
      ? new Date(Date.UTC(filters.yearTo, 11, 31, 23, 59, 59, 999))
      : undefined;
    query.releaseDate = query.releaseDate ?? {};
    if (lower !== undefined) {
      const current = query.releaseDate.$gte as Date | undefined;
      if (current === undefined || lower > current) {
        query.releaseDate.$gte = lower;
      }
    }
    if (upper !== undefined) {
      const current = query.releaseDate.$lte as Date | undefined;
      if (current === undefined || upper < current) {
        query.releaseDate.$lte = upper;
      }
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

export type LibraryOrderBy = "title" | "platform" | "releaseYear" | "status";

function librarySortDirection(filters: ListGamesQuery): 1 | -1 {
  return filters.order === "desc" ? -1 : 1;
}

/**
 * Server-side ordering for the library. Without orderBy the legacy
 * newest-first order is preserved. `status` lives on UserGame and sorts
 * directly; `title`/`platform`/`releaseYear` live on GlobalGame and need
 * the aggregation path below.
 *
 * Derived-field strategy (documented, deterministic):
 * - title: case-insensitive game name, missing → "".
 * - platform: case-insensitive FIRST platform of platforms[], missing → "".
 * - releaseYear: UTC year of releaseDate; games without a date always sort
 *   last, in both directions, then _id breaks remaining ties.
 */
export async function listGames(
  userId: string,
  filters: ListGamesQuery,
): Promise<PaginatedUserGame> {
  const query = await resolveGameQuery(userId, filters);
  const orderBy = filters.orderBy as LibraryOrderBy | undefined;

  if (orderBy === "title" || orderBy === "platform" || orderBy === "releaseYear") {
    return listGamesOrderedByGlobalField(query, filters, orderBy);
  }

  const direction = orderBy === "status" ? librarySortDirection(filters) : undefined;
  const [total, userGames] = await Promise.all([
    UserGame.countDocuments(query),
    UserGame.find(query)
      .sort(
        direction === undefined
          ? { updatedAt: -1 }
          : { status: direction, _id: 1 },
      )
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

async function listGamesOrderedByGlobalField(
  query: FilterQuery<UserGameDocument>,
  filters: ListGamesQuery,
  orderBy: Exclude<LibraryOrderBy, "status">,
): Promise<PaginatedUserGame> {
  const direction = librarySortDirection(filters);
  const join: PipelineStage[] = [
    { $match: query },
    {
      $lookup: {
        from: "globalgames",
        localField: "gameId",
        foreignField: "_id",
        as: "game",
      },
    },
    { $unwind: { path: "$game", preserveNullAndEmptyArrays: true } },
  ];
  const stages: PipelineStage[] =
    orderBy === "releaseYear"
      ? [
          ...join,
          {
            $addFields: {
              // $gt (not $ne): a missing releaseDate must count as dateless,
              // and only $gt evaluates missing as false against null.
              __hasYear: { $gt: ["$game.releaseDate", null] },
              __sortYear: {
                $year: { date: "$game.releaseDate", timezone: "UTC" },
              },
            },
          },
          { $sort: { __hasYear: -1, __sortYear: direction, _id: 1 } },
        ]
      : [
          ...join,
          {
            $addFields: {
              __sortKey:
                orderBy === "title"
                  ? { $toLower: { $ifNull: ["$game.name", ""] } }
                  : {
                      $toLower: {
                        $ifNull: [
                          { $arrayElemAt: ["$game.platforms", 0] },
                          "",
                        ],
                      },
                    },
            },
          },
          { $sort: { __sortKey: direction, _id: 1 } },
        ];

  // Paginate over the already-ordered result so pages are stable.
  const [result] = await UserGame.aggregate<{
    total: { count: number }[];
    data: Record<string, unknown>[];
  }>([
    ...stages,
    {
      $facet: {
        total: [{ $count: "count" }],
        data: [{ $skip: pageOffset(filters) }, { $limit: filters.limit }],
      },
    },
  ]);

  const total = result?.total[0]?.count ?? 0;
  const data = (result?.data ?? []).map((doc) => {
    const {
      __sortKey: _sortKey,
      __sortYear: _sortYear,
      __hasYear: _hasYear,
      ...rest
    } = doc;
    const game = (rest.game as GlobalGameDocument | null) ?? null;
    // Mirror the find-path shape ({...toObject(), game}), including its
    // gameId quirk (populated game object when present).
    return { ...rest, gameId: game ?? rest.gameId, game };
  });

  return buildPaginatedResponse(
    data as unknown as UserGameWithGame[],
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

  // Activity Feed (best effort): the library mutation already succeeded.
  // Persistence failures are logged inside recordActivity and never fail
  // this creation.
  await recordActivity(
    input.userId,
    parseActivityEvent({
      type: "game.added",
      userGameId: String(userGame._id),
      game: gameActivitySnapshot(globalGame),
      metadata: { source: globalGame.source },
    }),
  );

  return { ...userGame.toObject(), game: globalGame };
}

export async function updateGame(
  userId: string,
  gameId: string,
  input: UpdateGameInput,
): Promise<UserGameWithGame> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);

  // Permission for metadata edits is validated BEFORE any write: a
  // rejected request must never partially commit personal changes.
  const wantsMetadataEdit =
    input.game !== undefined && Object.keys(input.game).length > 0;
  let globalGame: GlobalGameDocument | null = null;
  if (wantsMetadataEdit) {
    globalGame = await GlobalGame.findById(userGame.gameId);
    if (!globalGame || globalGame.source !== "manual") {
      throw new ApiError(
        "GAME_METADATA_IMMUTABLE",
        "Metadata can only be edited on manually created games",
        400,
      );
    }
  }

  const personalUpdates: Record<string, unknown> = {};
  // Previous personal state, captured BEFORE any document mutation, so the
  // Activity Feed can diff real changes (same-value rewrites emit nothing).
  const previous = {
    status: userGame.status,
    timesFinished: userGame.timesFinished,
    finished: userGame.finished,
    favorite: userGame.favorite,
    fullyCompleted: userGame.fullyCompleted,
    rating: (userGame.rating ?? null) as number | null,
    hoursPlayed: userGame.hoursPlayed,
    achievements: userGame.achievements,
    achievementProgress:
      (userGame.achievementProgress ?? null) as number | null,
  };
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

  // Top 10 integrity: a game that stops being a favorite cannot remain
  // ranked. The reference is pulled by the Top 10 mutation, which owns the
  // `top10.removed` event (reason "unfavorited") — games never emit top10.*.
  if (personalUpdates.favorite === false) {
    await removeFromTop10(
      String(userGame.userId),
      String(userGame._id),
      "unfavorited",
    );
  }

  if (wantsMetadataEdit && globalGame) {
    const metadata = input.game!;
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

  const game = globalGame ?? (await GlobalGame.findById(userGame.gameId));

  // Activity Feed (best effort, deterministic order): one event per real
  // change, validated up-front, recorded after the state already persisted.
  // `review` and GlobalGame metadata edits intentionally emit nothing.
  if (game) {
    const snapshot = gameActivitySnapshot(game);
    const userGameId = String(userGame._id);
    const rawEvents: unknown[] = [];
    if (
      personalUpdates.status !== undefined &&
      personalUpdates.status !== previous.status
    ) {
      rawEvents.push({
        type: "game.status_changed",
        userGameId,
        game: snapshot,
        metadata: { from: previous.status, to: personalUpdates.status },
      });
    }
    if (personalUpdates.timesFinished !== undefined) {
      const nextTimes = personalUpdates.timesFinished as number;
      const nextFinished = deriveFinished(nextTimes);
      if (nextFinished && !previous.finished) {
        rawEvents.push({
          type: "game.finished",
          userGameId,
          game: snapshot,
          metadata: { timesFinished: nextTimes },
        });
      } else if (nextTimes !== previous.timesFinished) {
        rawEvents.push({
          type: "game.times_finished_changed",
          userGameId,
          game: snapshot,
          metadata: { from: previous.timesFinished, to: nextTimes },
        });
      }
    }
    if (
      personalUpdates.favorite !== undefined &&
      personalUpdates.favorite !== previous.favorite
    ) {
      rawEvents.push({
        type:
          personalUpdates.favorite === true
            ? "game.favorited"
            : "game.unfavorited",
        userGameId,
        game: snapshot,
        metadata: {},
      });
    }
    if (
      personalUpdates.fullyCompleted !== undefined &&
      personalUpdates.fullyCompleted !== previous.fullyCompleted
    ) {
      rawEvents.push({
        type:
          personalUpdates.fullyCompleted === true
            ? "game.completed"
            : "game.uncompleted",
        userGameId,
        game: snapshot,
        metadata: {},
      });
    }
    if (personalUpdates.rating !== undefined) {
      const nextRating = (personalUpdates.rating ?? null) as number | null;
      if (nextRating !== previous.rating) {
        rawEvents.push({
          type: "game.rating_changed",
          userGameId,
          game: snapshot,
          metadata: { from: previous.rating, to: nextRating },
        });
      }
    }
    if (
      personalUpdates.hoursPlayed !== undefined &&
      personalUpdates.hoursPlayed !== previous.hoursPlayed
    ) {
      rawEvents.push({
        type: "game.hours_changed",
        userGameId,
        game: snapshot,
        metadata: { from: previous.hoursPlayed, to: personalUpdates.hoursPlayed },
      });
    }
    if (
      input.achievements !== undefined ||
      input.achievementProgress !== undefined
    ) {
      const nextEnabled =
        input.achievements !== undefined
          ? input.achievements
          : previous.achievements;
      let nextProgress: number | null;
      if (input.achievementProgress !== undefined) {
        nextProgress = input.achievementProgress;
      } else if (input.achievements === false) {
        nextProgress = null;
      } else {
        nextProgress = previous.achievementProgress;
      }
      if (
        nextEnabled !== previous.achievements ||
        nextProgress !== previous.achievementProgress
      ) {
        rawEvents.push({
          type: "game.achievements_changed",
          userGameId,
          game: snapshot,
          metadata: {
            from: {
              enabled: previous.achievements,
              progress: previous.achievementProgress,
            },
            to: { enabled: nextEnabled, progress: nextProgress },
          },
        });
      }
    }
    const validated = rawEvents.map((event) => parseActivityEvent(event));
    for (const event of validated) {
      await recordActivity(userId, event);
    }
  }

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
  // Activity Feed (best effort): exactly one `game.finished` per finish
  // action — never an additional `game.times_finished_changed`.
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "game.finished",
      userGameId: String(updated._id),
      game: gameActivitySnapshot(game),
      metadata: { timesFinished: updated.timesFinished },
    }),
  );
  return { ...updated.toObject(), game };
}

export async function deleteGame(
  userId: string,
  gameId: string,
): Promise<void> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);
  // Snapshot BEFORE removal: the diary must keep the game name even after
  // the UserGame no longer exists. The shared GlobalGame record itself is
  // preserved by this operation.
  const snapshotGame = await GlobalGame.findById(userGame.gameId);
  const snapshot = snapshotGame
    ? gameActivitySnapshot(snapshotGame)
    : { name: "Unknown game" };
  // Only the user's relationship is removed. The shared GlobalGame record
  // is preserved, and list references die with the UserGame document.
  await userGame.deleteOne();
  // Notes die with their UserGame. Creation activities (`note.created`)
  // remain as history, like every other event in the append-only diary.
  await UserGameNote.deleteMany({ userGameId: userGame._id });
  // Top 10 integrity: no orphan references may survive UserGame deletion.
  // The Top 10 mutation owns the `top10.removed` event (reason
  // "game_deleted") and receives the pre-captured snapshot, since the
  // UserGame no longer exists at this point.
  await removeFromTop10(
    String(userGame.userId),
    String(userGame._id),
    "game_deleted",
    snapshot,
  );
  // Activity Feed (best effort): recorded only after effective removal.
  await recordActivity(
    userId,
    parseActivityEvent({
      type: "game.removed",
      userGameId: String(userGame._id),
      game: snapshot,
      metadata: {},
    }),
  );
}
