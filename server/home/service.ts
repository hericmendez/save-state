/**
 * Home highlights service. Computes the highlight candidates in a single
 * MongoDB aggregation (`$facet` over the user's library joined with
 * GlobalGame) — one query, never N+1, no Activity dependency.
 *
 * Candidate rules (deterministic except the two draws):
 * - mostHours: `hoursPlayed > 0`, sort `hoursPlayed` desc, `_id` asc.
 *   Games without recorded hours never win. (Rule also locked by
 *   `pickSpotlightWinner` in home-metrics.)
 * - topRated: `rating != null`, sort `rating` desc, `_id` asc.
 * - mostFinished: `timesFinished > 0`, sort `timesFinished` desc, `_id` asc.
 * - topPlatform/topGenre: unwind the GlobalGame array, group by value
 *   with distinct-game count + summed hours, sort `games` desc,
 *   `hours` desc, name asc.
 * - randomFavorite: `$sample` 1 over `favorite === true` (drawn
 *   server-side per page load).
 * - recentlyAdded: `createdAt` desc, `_id` desc. `createdAt` is the real
 *   library-inclusion date (document creation in `createGame`) — never
 *   `updatedAt`, never the game's release date.
 * - recentFinish: `lastFinishedAt != null`, sort `lastFinishedAt` desc,
 *   `_id` asc. `lastFinishedAt` is the persistent completion date owned
 *   by `UserGame` (see its schema comment) — never `updatedAt`, never
 *   inferred, and independent of the best-effort Activity feed, which
 *   remains exclusively a diary/history concern.
 * - wishlistSpot: `$sample` 1 over `status === "wishlist"` (drawn
 *   server-side per page load).
 * - buchaPool: the group of games tied at the lowest personal rating
 *   strictly below 5 (`$group` by rating asc + `$limit` 1, so every tied
 *   game is included with no arbitrary cap). Unrated games are excluded
 *   (never treated as zero). The caller draws one at random.
 *
 * Known limitations (documented, not silently approximated):
 * - Records finished before `lastFinishedAt` existed keep `null` unless
 *   the backfill recovered a proven event date — no date is ever
 *   invented for them.
 * - Orphan UserGames (missing GlobalGame) are dropped by the `$unwind`,
 *   matching the defensive behavior of `getTop10`.
 * Every candidate is `null`/empty when its data is missing — the caller
 * renders fallbacks and never fabricates values.
 */

import "server-only";
import { Types } from "mongoose";
import { connectDatabase } from "@/db/connection";
import { UserGame } from "@/db/models/user-game";
import type { UserGameWithGame } from "@/server/games/service";

export interface HighlightCategoryStat {
  name: string;
  games: number;
  hours: number;
}

export interface RecentFinish {
  userGame: UserGameWithGame;
  finishedAt: Date;
}

export interface HighlightData {
  mostHours: UserGameWithGame | null;
  topRated: UserGameWithGame | null;
  mostFinished: UserGameWithGame | null;
  topPlatform: HighlightCategoryStat | null;
  topGenre: HighlightCategoryStat | null;
  randomFavorite: UserGameWithGame | null;
  recentlyAdded: UserGameWithGame | null;
  recentFinish: RecentFinish | null;
  wishlistSpot: UserGameWithGame | null;
  buchaPool: UserGameWithGame[];
}

interface CategoryFacetDoc {
  _id: string;
  games: number;
  hours: number;
}

interface BuchaGroupDoc {
  _id: number;
  docs: Record<string, unknown>[];
}

interface HighlightFacetResult {
  mostHours: Record<string, unknown>[];
  topRated: Record<string, unknown>[];
  mostFinished: Record<string, unknown>[];
  topPlatforms: CategoryFacetDoc[];
  topGenres: CategoryFacetDoc[];
  randomFavorite: Record<string, unknown>[];
  recentlyAdded: Record<string, unknown>[];
  recentFinishes: Record<string, unknown>[];
  wishlistSpot: Record<string, unknown>[];
  buchaGroups: BuchaGroupDoc[];
}

function toUserGameWithGame(
  doc: Record<string, unknown> | undefined,
): UserGameWithGame | null {
  if (!doc || typeof doc !== "object") return null;
  const game = (doc as { game?: unknown }).game;
  if (!game || game instanceof Types.ObjectId) return null;
  return doc as unknown as UserGameWithGame;
}

function toCategoryStat(
  doc: CategoryFacetDoc | undefined,
): HighlightCategoryStat | null {
  if (!doc || typeof doc._id !== "string") return null;
  return { name: doc._id, games: doc.games, hours: doc.hours };
}

function toRecentFinish(
  doc: Record<string, unknown> | undefined,
): RecentFinish | null {
  const userGame = toUserGameWithGame(doc);
  if (!userGame) return null;
  const finishedAt = (doc as { lastFinishedAt?: unknown }).lastFinishedAt;
  if (!(finishedAt instanceof Date)) return null;
  return { userGame, finishedAt };
}

export async function getHighlightData(
  userId: string,
): Promise<HighlightData> {
  await connectDatabase();
  const [facetResult] = await Promise.all([
    UserGame.aggregate<HighlightFacetResult>([
      { $match: { userId: new Types.ObjectId(userId) } },
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
          mostHours: [
            { $match: { hoursPlayed: { $gt: 0 } } },
            { $sort: { hoursPlayed: -1, _id: 1 } },
            { $limit: 1 },
          ],
          topRated: [
            { $match: { rating: { $ne: null } } },
            { $sort: { rating: -1, _id: 1 } },
            { $limit: 1 },
          ],
          mostFinished: [
            { $match: { timesFinished: { $gt: 0 } } },
            { $sort: { timesFinished: -1, _id: 1 } },
            { $limit: 1 },
          ],
          topPlatforms: [
            { $unwind: "$game.platforms" },
            {
              $group: {
                _id: "$game.platforms",
                games: { $sum: 1 },
                hours: { $sum: "$hoursPlayed" },
              },
            },
            { $sort: { games: -1, hours: -1, _id: 1 } },
            { $limit: 1 },
          ],
          topGenres: [
            { $unwind: "$game.genres" },
            {
              $group: {
                _id: "$game.genres",
                games: { $sum: 1 },
                hours: { $sum: "$hoursPlayed" },
              },
            },
            { $sort: { games: -1, hours: -1, _id: 1 } },
            { $limit: 1 },
          ],
          randomFavorite: [
            { $match: { favorite: true } },
            { $sample: { size: 1 } },
          ],
          recentlyAdded: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $limit: 1 },
          ],
          recentFinishes: [
            { $match: { lastFinishedAt: { $ne: null } } },
            { $sort: { lastFinishedAt: -1, _id: 1 } },
            { $limit: 1 },
          ],
          wishlistSpot: [
            { $match: { status: "wishlist" } },
            { $sample: { size: 1 } },
          ],
          buchaGroups: [
            { $match: { rating: { $lt: 5 } } },
            { $sort: { rating: 1 } },
            {
              $group: {
                _id: "$rating",
                docs: { $push: "$$ROOT" },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 1 },
          ],
        },
      },
    ]),
  ]);
  const facet = facetResult[0];

  const buchaPool: UserGameWithGame[] = [];
  for (const doc of facet?.buchaGroups[0]?.docs ?? []) {
    const userGame = toUserGameWithGame(doc);
    if (userGame) buchaPool.push(userGame);
  }

  return {
    mostHours: toUserGameWithGame(facet?.mostHours[0]),
    topRated: toUserGameWithGame(facet?.topRated[0]),
    mostFinished: toUserGameWithGame(facet?.mostFinished[0]),
    topPlatform: toCategoryStat(facet?.topPlatforms[0]),
    topGenre: toCategoryStat(facet?.topGenres[0]),
    randomFavorite: toUserGameWithGame(facet?.randomFavorite[0]),
    recentlyAdded: toUserGameWithGame(facet?.recentlyAdded[0]),
    recentFinish: toRecentFinish(facet?.recentFinishes[0]),
    wishlistSpot: toUserGameWithGame(facet?.wishlistSpot[0]),
    buchaPool,
  };
}
