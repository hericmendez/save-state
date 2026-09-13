import type {
  Game,
  GameList,
  PaginatedResponse,
} from "@/features/shared/types";

/** Convert server-service documents into serializable client props. */
export function toPlainGame(value: unknown): Game {
  const raw = value as Record<string, unknown>;
  const game = (raw.game ?? null) as Record<string, unknown> | null;
  return {
    _id: String(raw._id),
    userId: raw.userId === undefined ? undefined : String(raw.userId),
    status: (raw.status as string | undefined) ?? undefined,
    hoursPlayed: (raw.hoursPlayed as number | undefined) ?? undefined,
    timesFinished: (raw.timesFinished as number | undefined) ?? undefined,
    rating: (raw.rating as number | null | undefined) ?? undefined,
    review: (raw.review as string | null | undefined) ?? undefined,
    listIds: Array.isArray(raw.listIds)
      ? (raw.listIds as unknown[]).map(String)
      : undefined,
    favorite: raw.favorite as boolean | undefined,
    finished: raw.finished as boolean | undefined,
    fullyCompleted: raw.fullyCompleted as boolean | undefined,
    achievements: raw.achievements as boolean | undefined,
    achievementProgress: raw.achievementProgress as number | null | undefined,
    achievementsCompleted: raw.achievementsCompleted as boolean | undefined,
    game:
      game === null
        ? null
        : {
            _id: game._id === undefined ? undefined : String(game._id),
            name: String(game.name),
            cover: (game.cover as string | null | undefined) ?? undefined,
            genres: (game.genres as string[] | undefined) ?? undefined,
            platforms: (game.platforms as string[] | undefined) ?? undefined,
            developers: (game.developers as string[] | undefined) ?? undefined,
            publishers: (game.publishers as string[] | undefined) ?? undefined,
            releaseDate:
              game.releaseDate === undefined || game.releaseDate === null
                ? undefined
                : String(game.releaseDate),
            summary: (game.summary as string | null | undefined) ?? undefined,
          },
  };
}

export function toPlainGameList(value: unknown): GameList {
  const raw = value as Record<string, unknown>;
  return {
    _id: String(raw._id),
    name: String(raw.name),
    gameCount:
      raw.gameCount === undefined ? undefined : Number(raw.gameCount),
  };
}

export function toPlainPaginatedGames(
  value: PaginatedResponse<unknown>,
): PaginatedResponse<Game> {
  return {
    data: value.data.map(toPlainGame),
    pagination: value.pagination,
  };
}
