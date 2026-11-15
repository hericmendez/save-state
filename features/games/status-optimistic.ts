import type { Game, Pagination } from "@/features/shared/types";

export function optimisticStatusPage({
  games,
  pagination,
  gameId,
  status,
  activeStatus,
  currentPage,
}: {
  games: Game[];
  pagination: Pagination | null;
  gameId: string;
  status: string;
  activeStatus: string;
  currentPage: number;
}): { games: Game[]; pagination: Pagination | null; pageChanged: boolean } {
  const leavesFilter = activeStatus !== "" && activeStatus !== status;
  const nextGames = leavesFilter
    ? games.filter((game) => game._id !== gameId)
    : games.map((game) =>
        game._id === gameId ? { ...game, status } : game,
      );
  if (!leavesFilter || !pagination) {
    return { games: nextGames, pagination, pageChanged: false };
  }

  const total = Math.max(0, pagination.total - 1);
  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
  const page = Math.min(currentPage, totalPages);
  return {
    games: nextGames,
    pagination: {
      ...pagination,
      page,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
    pageChanged: page !== currentPage,
  };
}
