import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GAME_STATUSES } from "@/schemas/games";
import { Dashboard } from "@/features/dashboard/dashboard";
import type { PersonalStatistics } from "@/server/stats/service";

const ZERO_STATUSES = Object.fromEntries(
  GAME_STATUSES.map((status) => [status, 0]),
) as Record<string, number>;

function stats(overrides: Partial<PersonalStatistics> = {}): PersonalStatistics {
  return {
    totalGames: 0,
    byRating: {},
    ratedGames: 0,
    unratedGames: 0,
    averageRating: null,
    totalHours: 0,
    gamesWithHours: 0,
    totalTimesFinished: 0,
    gamesWithTimesFinished: 0,
    favoriteGames: 0,
    favoriteUnrated: 0,
    finishedGames: 0,
    finishedRated: 0,
    finishedWithoutCompletion: 0,
    topHours: [],
    topFinished: [],
    ...overrides,
    byStatus: { ...ZERO_STATUSES, ...overrides.byStatus },
  };
}

function insightCount(html: string): number {
  return (html.match(/border-l-2 border-amber-400\/70/g) ?? []).length;
}

function allEligibleStats(): PersonalStatistics {
  return stats({
    totalGames: 100,
    byStatus: { backlog: 82, finished: 5, playing: 13 },
    ratedGames: 5,
    byRating: { "8": 5 },
    averageRating: 8,
    unratedGames: 95,
    totalHours: 100,
    gamesWithHours: 10,
    totalTimesFinished: 12,
    gamesWithTimesFinished: 6,
    favoriteGames: 3,
    favoriteUnrated: 1,
    finishedGames: 5,
    finishedRated: 2,
    finishedWithoutCompletion: 1,
    topHours: [
      { name: "Jogo A", value: 80 },
      { name: "Jogo B", value: 20 },
    ],
    topFinished: [
      { name: "Jogo A", value: 4 },
      { name: "Jogo B", value: 2 },
    ],
  });
}

describe("personal statistics rendering", () => {
  it("scales every status bar by the library total", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        stats={stats({
          totalGames: 34,
          byStatus: { backlog: 30, finished: 4 },
          unratedGames: 34,
        })}
      />,
    );
    expect(html).toContain("width:88.23529411764706%");
    expect(html).toContain("width:11.76470588235294%");
    expect(html).toContain("30 · 88,2%");
    expect(html).toContain("4 · 11,8%");
    expect(html).toContain("Backlog: 30 de 34 jogos, 88,2%");
    // The largest status is no longer forced to a full-width bar.
    expect(html).not.toContain("width:100%");
  });

  it("keeps rating distribution on the rated-games scale", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        stats={stats({
          totalGames: 10,
          byStatus: { playing: 7, finished: 3 },
          ratedGames: 3,
          unratedGames: 7,
          byRating: { "8": 2, "9": 1 },
          averageRating: 8.33,
        })}
      />,
    );
    expect(html).toContain("Cobertura: 30,0%");
    expect(html).toContain("Nota 8/10");
    expect(html).toContain("2 · 66,7%");
    expect(html).toContain("Nota 9/10");
    expect(html).toContain("1 · 33,3%");
    // Two games share the highest rating value, so that row is 100% of the
    // distribution scale (not of the library).
    expect(html).toContain("width:100%");
    expect(html).toContain("width:50%");
  });

  it("renders one, two or three discoveries without inventing more", () => {
    const one = renderToStaticMarkup(
      <Dashboard
        stats={stats({
          totalGames: 2,
          byStatus: { playing: 1, finished: 1 },
          favoriteGames: 2,
          favoriteUnrated: 1,
          finishedGames: 1,
        })}
      />,
    );
    expect(insightCount(one)).toBe(1);
    expect(one).toContain("Favoritos sem nota");

    const two = renderToStaticMarkup(
      <Dashboard
        stats={stats({
          totalGames: 2,
          byStatus: { playing: 1, finished: 1 },
          favoriteGames: 2,
          favoriteUnrated: 1,
          finishedGames: 1,
          finishedWithoutCompletion: 1,
        })}
      />,
    );
    expect(insightCount(two)).toBe(2);
    expect(two).toContain("Finalizados sem conclusão no contador");

    const three = renderToStaticMarkup(<Dashboard stats={allEligibleStats()} />);
    expect(insightCount(three)).toBe(3);
    expect(three).toContain("Concentração no Backlog");
  });

  it("renders the empty state without artificial discoveries", () => {
    const html = renderToStaticMarkup(<Dashboard stats={stats()} />);
    expect(insightCount(html)).toBe(0);
    expect(html).toContain("Ainda não há descobertas suficientes");
    // Status and rating modules share the empty-library copy.
    expect((html.match(/Sua biblioteca ainda está vazia\./g) ?? []).length).toBe(2);
    // Hours and conclusions modules share their empty copy.
    expect((html.match(/Nenhum registro disponível ainda\./g) ?? []).length).toBe(2);
    expect(html).not.toContain("Nenhum jogo avaliado ainda.");
  });

  it("keeps one h1, one h2 per section and one h3 per discovery", () => {
    const empty = renderToStaticMarkup(<Dashboard stats={stats()} />);
    expect((empty.match(/<h1/g) ?? []).length).toBe(1);
    expect((empty.match(/<h2/g) ?? []).length).toBe(5);
    expect((empty.match(/<h3/g) ?? []).length).toBe(0);

    const full = renderToStaticMarkup(<Dashboard stats={allEligibleStats()} />);
    expect((full.match(/<h1/g) ?? []).length).toBe(1);
    expect((full.match(/<h2/g) ?? []).length).toBe(5);
    expect((full.match(/<h3/g) ?? []).length).toBe(3);
  });

  it("complements the conclusions insight with different quantitative context", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        stats={stats({
          totalGames: 10,
          byStatus: { playing: 6, finished: 4 },
          ratedGames: 0,
          unratedGames: 10,
          totalTimesFinished: 2,
          gamesWithTimesFinished: 2,
          finishedGames: 4,
          finishedRated: 0,
          finishedWithoutCompletion: 2,
          topFinished: [
            { name: "Jogo A", value: 1 },
            { name: "Jogo B", value: 1 },
          ],
        })}
      />,
    );
    expect(html).toContain(
      "No status Finalizado: 4 jogos; 2 sem conclusão registrada no contador.",
    );
    expect(html).toContain("permanece editável");
    expect(html).toContain("2 dos seus 4 jogos");
    // The module does not repeat the insight's exact paragraph.
    expect(html).not.toContain("campos independentes");
  });

  it("uses only the short conceptual note when status and counter agree", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        stats={stats({
          totalGames: 10,
          byStatus: { playing: 6, finished: 4 },
          ratedGames: 0,
          unratedGames: 10,
          totalTimesFinished: 4,
          gamesWithTimesFinished: 4,
          finishedGames: 4,
          finishedWithoutCompletion: 0,
          topFinished: [{ name: "Jogo A", value: 4 }],
        })}
      />,
    );
    expect(html).toContain("No status Finalizado: 4 jogos; 0 sem conclusão");
    expect(html).toContain("Status e contador são informações independentes.");
  });
});
