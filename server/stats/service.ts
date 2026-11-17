/**
 * Game statistics service. Powers the dashboard data path:
 * Dashboard Server Component → getGameStats → MongoDB aggregation.
 */

import "server-only";
import { GAME_STATUSES } from "@/schemas/games";
import { UserGame } from "@/db/models/user-game";
import { Types } from "mongoose";
import {
  resolveGameQuery,
  type GameQuery,
} from "@/server/games/service";

export type GameStatsFilters = GameQuery;

export type Distribution = Record<string, number>;

export interface PersonalStatistics {
  totalGames: number;
  byStatus: Distribution;
  byRating: Distribution;
  ratedGames: number;
  unratedGames: number;
  /** Average of the ratings that exist; null when no game has a rating. */
  averageRating: number | null;
  /** Sum of hoursPlayed across the library (missing/zero contribute nothing). */
  totalHours: number;
  /** Games with hoursPlayed > 0. Zero does not prove a game was never played. */
  gamesWithHours: number;
  /** Sum of the personal timesFinished counters. */
  totalTimesFinished: number;
  /** Games whose timesFinished counter is > 0 (independent of status). */
  gamesWithTimesFinished: number;
  favoriteGames: number;
  /** Favorites that have no numeric rating. */
  favoriteUnrated: number;
  /** Games whose status is exactly "finished". */
  finishedGames: number;
  /** Games which are both status "finished" and have a numeric rating. */
  finishedRated: number;
  /** Intersection: status "finished" AND no completion counter recorded. */
  finishedWithoutCompletion: number;
  topHours: { name: string; value: number }[];
  topFinished: { name: string; value: number }[];
}

/** Data dedicated to the personal statistics page; includes orphaned UserGames. */
export async function getPersonalStatistics(userId: string): Promise<PersonalStatistics> {
  const hasNumericRating = {
    $in: [{ $type: "$rating" }, ["double", "int", "long", "decimal"]],
  };
  const [result] = await UserGame.aggregate<{
    totalGames: number;
    statuses: { _id: string; count: number }[];
    ratings: { _id: number; count: number }[];
    ratedGames: number;
    averageRating: number | null;
    totalHours: number;
    gamesWithHours: number;
    totalTimesFinished: number;
    gamesWithTimesFinished: number;
    favoriteGames: number;
    favoriteUnrated: number;
    finishedGames: number;
    finishedRated: number;
    finishedWithoutCompletion: number;
    topHours: { name: string | null; value: number }[];
    topFinished: { name: string | null; value: number }[];
  }>([
    { $match: { userId: new Types.ObjectId(userId) } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalGames: { $sum: 1 },
              averageRating: { $avg: "$rating" },
              totalHours: { $sum: "$hoursPlayed" },
              gamesWithHours: {
                $sum: { $cond: [{ $gt: ["$hoursPlayed", 0] }, 1, 0] },
              },
              totalTimesFinished: { $sum: "$timesFinished" },
              gamesWithTimesFinished: {
                $sum: { $cond: [{ $gt: ["$timesFinished", 0] }, 1, 0] },
              },
              favoriteGames: {
                $sum: { $cond: [{ $eq: ["$favorite", true] }, 1, 0] },
              },
              favoriteUnrated: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$favorite", true] },
                        { $not: [hasNumericRating] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              finishedGames: {
                $sum: { $cond: [{ $eq: ["$status", "finished"] }, 1, 0] },
              },
              finishedRated: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$status", "finished"] }, hasNumericRating] },
                    1,
                    0,
                  ],
                },
              },
              finishedWithoutCompletion: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$status", "finished"] },
                        { $eq: [{ $ifNull: ["$timesFinished", 0] }, 0] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        ratings: [
          { $match: { rating: { $type: "number" } } },
          { $group: { _id: "$rating", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        rated: [
          { $match: { rating: { $type: "number" } } },
          { $count: "count" },
        ],
        topHours: [
          { $match: { hoursPlayed: { $gt: 0 } } },
          { $sort: { hoursPlayed: -1, _id: 1 } },
          { $limit: 5 },
          { $lookup: { from: "globalgames", localField: "gameId", foreignField: "_id", as: "game" } },
          { $project: { _id: 0, value: "$hoursPlayed", name: { $ifNull: [{ $arrayElemAt: ["$game.name", 0] }, "Jogo indisponível"] } } },
        ],
        topFinished: [
          { $match: { timesFinished: { $gt: 0 } } },
          { $sort: { timesFinished: -1, _id: 1 } },
          { $limit: 5 },
          { $lookup: { from: "globalgames", localField: "gameId", foreignField: "_id", as: "game" } },
          { $project: { _id: 0, value: "$timesFinished", name: { $ifNull: [{ $arrayElemAt: ["$game.name", 0] }, "Jogo indisponível"] } } },
        ],
      },
    },
    {
      $project: {
        totalGames: { $ifNull: [{ $arrayElemAt: ["$totals.totalGames", 0] }, 0] },
        statuses: 1,
        ratings: 1,
        ratedGames: { $ifNull: [{ $arrayElemAt: ["$rated.count", 0] }, 0] },
        averageRating: { $arrayElemAt: ["$totals.averageRating", 0] },
        totalHours: { $ifNull: [{ $arrayElemAt: ["$totals.totalHours", 0] }, 0] },
        gamesWithHours: { $ifNull: [{ $arrayElemAt: ["$totals.gamesWithHours", 0] }, 0] },
        totalTimesFinished: {
          $ifNull: [{ $arrayElemAt: ["$totals.totalTimesFinished", 0] }, 0],
        },
        gamesWithTimesFinished: {
          $ifNull: [{ $arrayElemAt: ["$totals.gamesWithTimesFinished", 0] }, 0],
        },
        favoriteGames: { $ifNull: [{ $arrayElemAt: ["$totals.favoriteGames", 0] }, 0] },
        favoriteUnrated: { $ifNull: [{ $arrayElemAt: ["$totals.favoriteUnrated", 0] }, 0] },
        finishedGames: { $ifNull: [{ $arrayElemAt: ["$totals.finishedGames", 0] }, 0] },
        finishedRated: { $ifNull: [{ $arrayElemAt: ["$totals.finishedRated", 0] }, 0] },
        finishedWithoutCompletion: {
          $ifNull: [{ $arrayElemAt: ["$totals.finishedWithoutCompletion", 0] }, 0],
        },
        topHours: 1,
        topFinished: 1,
      },
    },
  ]);
  const byStatus: Distribution = Object.fromEntries(
    GAME_STATUSES.map((status) => [status, result?.statuses.find((row) => row._id === status)?.count ?? 0]),
  );
  return {
    totalGames: result?.totalGames ?? 0,
    byStatus,
    byRating: toDistribution(result?.ratings ?? []),
    ratedGames: result?.ratedGames ?? 0,
    unratedGames: (result?.totalGames ?? 0) - (result?.ratedGames ?? 0),
    averageRating: result?.averageRating ?? null,
    totalHours: result?.totalHours ?? 0,
    gamesWithHours: result?.gamesWithHours ?? 0,
    totalTimesFinished: result?.totalTimesFinished ?? 0,
    gamesWithTimesFinished: result?.gamesWithTimesFinished ?? 0,
    favoriteGames: result?.favoriteGames ?? 0,
    favoriteUnrated: result?.favoriteUnrated ?? 0,
    finishedGames: result?.finishedGames ?? 0,
    finishedRated: result?.finishedRated ?? 0,
    finishedWithoutCompletion: result?.finishedWithoutCompletion ?? 0,
    topHours: (result?.topHours ?? []).map((row) => ({ ...row, name: row.name ?? "Jogo indisponível" })),
    topFinished: (result?.topFinished ?? []).map((row) => ({ ...row, name: row.name ?? "Jogo indisponível" })),
  };
}

export interface GameStats {
  totalGames: number;
  totalHoursPlayed: number;
  totalTimesFinished: number;
  averageRating: number | null;
  averageHoursPlayed: number;
  averageTimesFinished: number;
  totalFinished: number;
  totalFavorites: number;
  totalFullyCompleted: number;
  totalAchievementsCompleted: number;
  averageAchievementProgress: number | null;
  byStatus: Distribution;
  byGenre: Distribution;
  byPlatform: Distribution;
  byDeveloper: Distribution;
  byPublisher: Distribution;
  byReleaseYear: Distribution;
  byRating: Distribution;
}

function toDistribution(
  entries: { _id: unknown; count: number }[],
): Distribution {
  const result: Distribution = {};
  for (const entry of entries) {
    if (entry._id === null || entry._id === undefined) continue;
    result[String(entry._id)] = entry.count;
  }
  return result;
}

export async function getGameStats(
  userId: string,
  filters: GameQuery,
): Promise<GameStats> {
  const query = await resolveGameQuery(userId, filters);

  const [totals] = await UserGame.aggregate<{
    totalGames: number;
    totalHoursPlayed: number;
    totalTimesFinished: number;
    averageRating: number | null;
    averageHoursPlayed: number;
    averageTimesFinished: number;
    totalFinished: number;
    totalFavorites: number;
    totalFullyCompleted: number;
    totalAchievementsCompleted: number;
    averageAchievementProgress: number | null;
  }>([
    { $match: query },
    {
      $group: {
        _id: null,
        totalGames: { $sum: 1 },
        totalHoursPlayed: { $sum: "$hoursPlayed" },
        totalTimesFinished: { $sum: "$timesFinished" },
        averageRating: { $avg: "$rating" },
        averageHoursPlayed: { $avg: "$hoursPlayed" },
        averageTimesFinished: { $avg: "$timesFinished" },
        totalFinished: {
          $sum: { $cond: [{ $gt: ["$timesFinished", 0] }, 1, 0] },
        },
        totalFavorites: {
          $sum: { $cond: ["$favorite", 1, 0] },
        },
        totalFullyCompleted: {
          $sum: { $cond: ["$fullyCompleted", 1, 0] },
        },
        totalAchievementsCompleted: {
          $sum: { $cond: ["$achievementsCompleted", 1, 0] },
        },
        averageAchievementProgress: { $avg: "$achievementProgress" },
      },
    },
    { $project: { _id: 0 } },
  ]);

  const [facetResult] = await UserGame.aggregate<
    Record<string, { _id: unknown; count: number }[]>
  >([
    { $match: query },
    {
      $lookup: {
        from: "globalgames",
        localField: "gameId",
        foreignField: "_id",
        as: "game",
      },
    },
    { $unwind: "$game" },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byGenre: [
          { $unwind: "$game.genres" },
          { $group: { _id: "$game.genres", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byPlatform: [
          { $unwind: "$game.platforms" },
          { $group: { _id: "$game.platforms", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byDeveloper: [
          { $unwind: "$game.developers" },
          { $group: { _id: "$game.developers", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byPublisher: [
          { $unwind: "$game.publishers" },
          { $group: { _id: "$game.publishers", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byReleaseYear: [
          {
            $project: {
              releaseYear: {
                $year: {
                  date: "$game.releaseDate",
                  timezone: "UTC",
                },
              },
            },
          },
          { $match: { releaseYear: { $ne: null } } },
          { $group: { _id: "$releaseYear", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        byRating: [
          { $match: { rating: { $ne: null } } },
          { $group: { _id: "$rating", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const byStatus = toDistribution(facetResult?.byStatus ?? []);
  const orderedByStatus: Distribution = {};
  for (const status of GAME_STATUSES) {
    if (status in byStatus) {
      orderedByStatus[status] = byStatus[status];
    }
  }

  return {
    totalGames: totals?.totalGames ?? 0,
    totalHoursPlayed: totals?.totalHoursPlayed ?? 0,
    totalTimesFinished: totals?.totalTimesFinished ?? 0,
    averageRating: totals?.averageRating ?? null,
    averageHoursPlayed: totals?.averageHoursPlayed ?? 0,
    averageTimesFinished: totals?.averageTimesFinished ?? 0,
    totalFinished: totals?.totalFinished ?? 0,
    totalFavorites: totals?.totalFavorites ?? 0,
    totalFullyCompleted: totals?.totalFullyCompleted ?? 0,
    totalAchievementsCompleted: totals?.totalAchievementsCompleted ?? 0,
    averageAchievementProgress: totals?.averageAchievementProgress ?? null,
    byStatus: orderedByStatus,
    byGenre: toDistribution(facetResult?.byGenre ?? []),
    byPlatform: toDistribution(facetResult?.byPlatform ?? []),
    byDeveloper: toDistribution(facetResult?.byDeveloper ?? []),
    byPublisher: toDistribution(facetResult?.byPublisher ?? []),
    byReleaseYear: toDistribution(facetResult?.byReleaseYear ?? []),
    byRating: toDistribution(facetResult?.byRating ?? []),
  };
}
