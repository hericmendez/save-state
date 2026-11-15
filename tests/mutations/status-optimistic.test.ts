import { describe, expect, it } from "vitest";
import { optimisticStatusPage } from "@/features/games/status-optimistic";
import type { Game, Pagination } from "@/features/shared/types";

const game = (id: string, status: string): Game =>
  ({ _id: id, status, game: { name: id } }) as Game;

const pagination: Pagination = {
  page: 2,
  limit: 2,
  total: 5,
  totalPages: 3,
  hasPreviousPage: true,
  hasNextPage: true,
};

describe("optimisticStatusPage", () => {
  it("patches status in place when the game still matches filters", () => {
    const result = optimisticStatusPage({
      games: [game("a", "playing")],
      pagination,
      gameId: "a",
      status: "completed",
      activeStatus: "",
      currentPage: 2,
    });
    expect(result.games[0].status).toBe("completed");
    expect(result.pagination).toEqual(pagination);
    expect(result.pageChanged).toBe(false);
  });

  it("removes a game leaving the status filter and adjusts the page", () => {
    const result = optimisticStatusPage({
      games: [game("a", "playing"), game("b", "playing")],
      pagination,
      gameId: "a",
      status: "completed",
      activeStatus: "playing",
      currentPage: 2,
    });
    expect(result.games.map(({ _id }) => _id)).toEqual(["b"]);
    expect(result.pagination).toMatchObject({
      page: 2,
      total: 4,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });
    expect(result.pageChanged).toBe(false);
  });

  it("moves to the last valid page when removal empties the last page", () => {
    const lastPage = { ...pagination, page: 3, total: 5, totalPages: 3 };
    const result = optimisticStatusPage({
      games: [game("a", "playing")],
      pagination: lastPage,
      gameId: "a",
      status: "completed",
      activeStatus: "playing",
      currentPage: 3,
    });
    expect(result.pagination?.page).toBe(2);
    expect(result.pageChanged).toBe(true);
  });
});
