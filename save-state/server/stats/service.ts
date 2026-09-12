/**
 * Game statistics service. Powers the dashboard data path:
 * Dashboard Server Component → getGameStats → MongoDB aggregation.
 */

import "server-only";
import { GAME_STATUSES } from "@/schemas/games";
import { UserGame } from "@/db/models/user-game";
import {
  resolveGameQuery,
  type GameQuery,
} from "@/server/games/service";

export type GameStatsFilters = GameQuery;

export type Distribution = Record<string, number>;

export interface GameStats {
  totalGames: number;
  totalHoursPlayed: number;
  totalTimesFinished: number;
  averageRating: number | null;
  averageHoursPlayed: number;
  averageTimesFinished: number;
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
    byStatus: orderedByStatus,
    byGenre: toDistribution(facetResult?.byGenre ?? []),
    byPlatform: toDistribution(facetResult?.byPlatform ?? []),
    byDeveloper: toDistribution(facetResult?.byDeveloper ?? []),
    byPublisher: toDistribution(facetResult?.byPublisher ?? []),
    byReleaseYear: toDistribution(facetResult?.byReleaseYear ?? []),
    byRating: toDistribution(facetResult?.byRating ?? []),
  };
}
