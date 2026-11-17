import { describe, expect, it } from "vitest";
import {
  MAX_LIBRARY_INSIGHTS,
  MAX_RELATIONAL_INSIGHTS,
  buildLibraryInsights,
  selectLibraryInsights,
  type Insight,
  type InsightInput,
} from "@/features/dashboard/statistics-insights";
import {
  formatAverageRating,
  formatHours,
  formatInteger,
  formatPercent,
  formatRating,
  gamesLabel,
  plural,
} from "@/features/dashboard/statistics-format";

/** Neutral input: every rule is below its threshold, so no insight fires. */
function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    totalGames: 10,
    byStatus: { backlog: 5, playing: 5 },
    ratedGames: 5,
    byRating: { "8": 5 },
    averageRating: 8,
    totalHours: 20,
    gamesWithHours: 2,
    totalTimesFinished: 2,
    gamesWithTimesFinished: 2,
    favoriteGames: 2,
    favoriteUnrated: 0,
    finishedGames: 4,
    finishedRated: 0,
    finishedWithoutCompletion: 0,
    topHours: [
      { name: "Jogo A", value: 10 },
      { name: "Jogo B", value: 10 },
    ],
    ...overrides,
  };
}

function ids(stats: InsightInput): string[] {
  return buildLibraryInsights(stats).map((insight) => insight.id);
}

/** Synthetic candidate, used only to exercise selection/deduplication rules. */
function candidate(
  overrides: Partial<Insight> &
    Pick<Insight, "id" | "category" | "kind" | "theme">,
): Insight {
  return {
    title: "Título",
    description: "Descrição",
    priority: 1,
    values: {},
    ...overrides,
  };
}

/** All six rules eligible, with internally coherent numbers. */
function allEligible(): InsightInput {
  return input({
    totalGames: 100,
    byStatus: { backlog: 82, finished: 5, playing: 13 },
    ratedGames: 5,
    byRating: { "8": 5 },
    averageRating: 8,
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
  });
}

describe("library insights engine", () => {
  it("returns no insights for an empty library", () => {
    expect(
      buildLibraryInsights(
        input({
          totalGames: 0,
          byStatus: {},
          ratedGames: 0,
          byRating: {},
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
        }),
      ),
    ).toEqual([]);
  });

  it("returns no insights for a single-game library", () => {
    expect(
      ids(
        input({
          totalGames: 1,
          byStatus: { backlog: 1 },
          ratedGames: 0,
          byRating: {},
          averageRating: null,
          totalHours: 0,
          gamesWithHours: 0,
          totalTimesFinished: 0,
          gamesWithTimesFinished: 0,
          favoriteGames: 0,
          finishedGames: 0,
          topHours: [],
        }),
      ),
    ).toEqual([]);
  });

  it("reports backlog concentration above 80% with five or more games", () => {
    const insights = buildLibraryInsights(
      input({ totalGames: 10, byStatus: { backlog: 9, finished: 1 } }),
    );
    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe("backlog-concentration");
    expect(insights[0].kind).toBe("descriptive");
    expect(insights[0].description).toContain("90,0%");
    expect(insights[0].description).toContain("9 de 10 jogos");
    expect(insights[0].values).toMatchObject({ backlogCount: 9, totalGames: 10 });
    // Observational tone: never framed as debt or a problem.
    expect(insights[0].description).not.toMatch(/dívida|problema|deveria/i);
  });

  it("does not report backlog concentration at exactly 80%", () => {
    expect(
      ids(input({ totalGames: 10, byStatus: { backlog: 8, playing: 2 } })),
    ).not.toContain("backlog-concentration");
  });

  it("reports low rating coverage with clear numerator and denominator", () => {
    const insights = buildLibraryInsights(
      input({ totalGames: 10, ratedGames: 2, byRating: { "8": 2 }, averageRating: 8 }),
    );
    const coverage = insights.find((insight) => insight.id === "rating-coverage");
    expect(coverage).toBeDefined();
    expect(coverage?.kind).toBe("descriptive");
    expect(coverage?.description).toContain("20,0%");
    expect(coverage?.description).toContain("2 de 10 jogos");
    expect(coverage?.description).toContain("8,0/10");
    expect(coverage?.values).toMatchObject({ ratedGames: 2, totalGames: 10 });
  });

  it("treats rating 0 as a real rating for coverage", () => {
    const insights = buildLibraryInsights(
      input({
        totalGames: 10,
        ratedGames: 2,
        byRating: { "0": 1, "8": 1 },
        averageRating: 4,
      }),
    );
    const coverage = insights.find((insight) => insight.id === "rating-coverage");
    expect(coverage).toBeDefined();
    expect(coverage?.values.ratedGames).toBe(2);
    expect(formatRating(0)).toBe("0");
    expect(coverage?.description).toContain("4,0/10");
  });

  it("preserves fractional ratings without silent rounding", () => {
    expect(formatRating(8.25)).toBe("8,25");
    expect(formatRating(7.5)).toBe("7,5");
    expect(formatRating(9)).toBe("9");
    expect(formatAverageRating(8.25)).toBe("8,3");
  });

  it("reports hours concentration when one game dominates the total", () => {
    const insights = buildLibraryInsights(
      input({
        totalHours: 20,
        gamesWithHours: 3,
        topHours: [
          { name: "Jogo A", value: 15 },
          { name: "Jogo B", value: 3 },
          { name: "Jogo C", value: 2 },
        ],
      }),
    );
    const hours = insights.find((insight) => insight.id === "hours-concentration");
    expect(hours).toBeDefined();
    expect(hours?.description).toContain("75,0%");
    expect(hours?.description).toContain("15 de 20 horas");
    expect(hours?.values).toMatchObject({ gameName: "Jogo A", gameHours: 15 });
  });

  it("does not report hours concentration when total hours are zero or too small", () => {
    expect(
      ids(
        input({
          totalHours: 0,
          gamesWithHours: 0,
          topHours: [],
        }),
      ),
    ).not.toContain("hours-concentration");
    expect(
      ids(
        input({
          totalHours: 5,
          gamesWithHours: 2,
          topHours: [
            { name: "Jogo A", value: 4 },
            { name: "Jogo B", value: 1 },
          ],
        }),
      ),
    ).not.toContain("hours-concentration");
  });

  it("uses the real intersection of status finished and no completion counter", () => {
    const insights = buildLibraryInsights(
      input({
        finishedGames: 4,
        finishedRated: 1,
        finishedWithoutCompletion: 2,
        gamesWithTimesFinished: 3,
        totalTimesFinished: 7,
      }),
    );
    const finished = insights.find((insight) => insight.id === "finished-without-counter");
    expect(finished).toBeDefined();
    expect(finished?.kind).toBe("relational");
    expect(finished?.values.finishedWithoutCompletion).toBe(2);
    expect(finished?.description).toContain("2 dos seus 4 jogos");
    expect(finished?.description).toContain("não possuem");
    expect(finished?.description).toContain("informações independentes");
    expect(finished?.description).not.toMatch(/incorreto|erro de cadastro/i);
  });

  it("does not infer finished-without-counter from completions under other statuses", () => {
    expect(
      ids(
        input({
          finishedGames: 1,
          finishedRated: 0,
          finishedWithoutCompletion: 0,
          gamesWithTimesFinished: 5,
          totalTimesFinished: 9,
        }),
      ),
    ).not.toContain("finished-without-counter");
  });

  it("reports favorites without ratings using independent markers", () => {
    const insights = buildLibraryInsights(
      input({ favoriteGames: 3, favoriteUnrated: 1 }),
    );
    const favorites = insights.find((insight) => insight.id === "favorites-without-rating");
    expect(favorites).toBeDefined();
    expect(favorites?.kind).toBe("relational");
    expect(favorites?.description).toContain("1 dos seus 3 jogos favoritos");
    expect(favorites?.description).toContain("ainda não possui avaliação");
    expect(favorites?.description).toContain("marcações independentes");
  });

  it("reports finished games with ratings using the finished subset", () => {
    const stats = input({
      totalGames: 10,
      byStatus: { backlog: 4, finished: 6 },
      ratedGames: 2,
      byRating: { "8": 2 },
      averageRating: 8,
      finishedGames: 6,
      finishedRated: 2,
      finishedWithoutCompletion: 0,
      totalHours: 0,
      gamesWithHours: 0,
      favoriteGames: 0,
      topHours: [],
    });
    const insights = buildLibraryInsights(stats);
    const finished = insights.find((insight) => insight.id === "finished-ratings");
    expect(finished).toBeDefined();
    expect(finished?.kind).toBe("relational");
    expect(finished?.description).toContain("2 dos seus 6 jogos finalizados receberam uma nota");
    expect(finished?.description).toContain("33,3%");
    expect(finished?.values).toMatchObject({ finishedRated: 2, finishedGames: 6 });
  });

  it("suppresses insights for small samples", () => {
    const smallLibrary = input({
      totalGames: 4,
      byStatus: { backlog: 4 },
      favoriteGames: 1,
      favoriteUnrated: 1,
      finishedGames: 4,
      finishedRated: 1,
      totalHours: 4,
      gamesWithHours: 2,
      topHours: [
        { name: "Jogo A", value: 3 },
        { name: "Jogo B", value: 1 },
      ],
    });
    expect(buildLibraryInsights(smallLibrary)).toEqual([]);
  });

  it("returns an empty list when no rule is eligible", () => {
    expect(buildLibraryInsights(input())).toEqual([]);
  });

  it("orders descriptive insights deterministically when no relational rule fires", () => {
    const insights = buildLibraryInsights(
      input({
        totalGames: 10,
        byStatus: { backlog: 9, finished: 1 },
        ratedGames: 1,
        byRating: { "8": 1 },
        averageRating: 8,
        totalHours: 20,
        gamesWithHours: 2,
        topHours: [
          { name: "Jogo A", value: 15 },
          { name: "Jogo B", value: 5 },
        ],
      }),
    );
    expect(insights.map((insight) => insight.id)).toEqual([
      "backlog-concentration",
      "rating-coverage",
      "hours-concentration",
    ]);
    expect(insights.every((insight) => insight.kind === "descriptive")).toBe(true);
    expect(insights.map((insight) => insight.priority)).toEqual([1, 2, 3]);
  });

  it("prioritizes relational discoveries over descriptive repeats", () => {
    const insights = buildLibraryInsights(allEligible());
    expect(insights.map((insight) => insight.id)).toEqual([
      "finished-without-counter",
      "finished-ratings",
      "backlog-concentration",
    ]);
    expect(insights.map((insight) => insight.kind)).toEqual([
      "relational",
      "relational",
      "descriptive",
    ]);
  });

  it("never returns more than three insights", () => {
    const insights = buildLibraryInsights(allEligible());
    expect(insights).toHaveLength(MAX_LIBRARY_INSIGHTS);
    expect(insights.length).toBeLessThanOrEqual(3);
  });

  it("caps relational discoveries and leaves room for one descriptive complement", () => {
    const insights = buildLibraryInsights(allEligible());
    expect(
      insights.filter((insight) => insight.kind === "relational"),
    ).toHaveLength(MAX_RELATIONAL_INSIGHTS);
    expect(
      insights.filter((insight) => insight.kind === "descriptive"),
    ).toHaveLength(1);
  });

  it("falls back to descriptive insights when no relational rule is eligible", () => {
    const insights = buildLibraryInsights(
      input({
        totalGames: 10,
        byStatus: { backlog: 9, finished: 1 },
        ratedGames: 0,
        byRating: {},
        averageRating: null,
        totalHours: 0,
        gamesWithHours: 0,
        favoriteGames: 0,
        finishedGames: 1,
        finishedRated: 0,
        finishedWithoutCompletion: 0,
        topHours: [],
      }),
    );
    expect(insights.map((insight) => insight.id)).toEqual(["backlog-concentration"]);
  });

  it("renders exactly one insight when only one rule is eligible", () => {
    const insights = buildLibraryInsights(
      input({
        totalGames: 2,
        byStatus: { playing: 1, finished: 1 },
        ratedGames: 0,
        byRating: {},
        averageRating: null,
        totalHours: 0,
        gamesWithHours: 0,
        favoriteGames: 2,
        favoriteUnrated: 1,
        finishedGames: 1,
        finishedRated: 0,
        finishedWithoutCompletion: 0,
        topHours: [],
      }),
    );
    expect(insights.map((insight) => insight.id)).toEqual([
      "favorites-without-rating",
    ]);
  });

  it("returns two insights when only two relational rules are eligible", () => {
    const insights = buildLibraryInsights(
      input({
        totalGames: 2,
        byStatus: { playing: 1, finished: 1 },
        ratedGames: 0,
        byRating: {},
        averageRating: null,
        totalHours: 0,
        gamesWithHours: 0,
        favoriteGames: 2,
        favoriteUnrated: 1,
        finishedGames: 1,
        finishedRated: 0,
        finishedWithoutCompletion: 1,
        topHours: [],
      }),
    );
    expect(insights.map((insight) => insight.id)).toEqual([
      "finished-without-counter",
      "favorites-without-rating",
    ]);
  });

  it("deduplicates by semantic theme, keeping the relational candidate", () => {
    const descriptive = candidate({
      id: "rating-coverage",
      category: "rating-coverage",
      kind: "descriptive",
      theme: "rating-coverage",
      priority: 1,
      title: "Cobertura descritiva",
    });
    const relational = candidate({
      id: "favorites-without-rating",
      category: "favorites-without-rating",
      kind: "relational",
      theme: "rating-coverage",
      priority: 9,
      title: "Relação de favoritos",
    });
    const selected = selectLibraryInsights([descriptive, relational]);
    expect(selected.map((insight) => insight.id)).toEqual([
      "favorites-without-rating",
    ]);
  });

  it("deduplicates by technical category even with different themes", () => {
    const first = candidate({
      id: "rating-coverage",
      category: "rating-coverage",
      kind: "descriptive",
      theme: "rating-coverage",
      priority: 1,
      title: "Primeira",
    });
    const second = candidate({
      id: "rating-coverage",
      category: "rating-coverage",
      kind: "descriptive",
      theme: "hours-concentration",
      priority: 2,
      title: "Segunda",
    });
    const selected = selectLibraryInsights([second, first]);
    expect(selected.map((insight) => insight.title)).toEqual(["Primeira"]);
  });

  it("preserves independent crossings of the same status subset", () => {
    const counter = candidate({
      id: "finished-without-counter",
      category: "finished-without-counter",
      kind: "relational",
      theme: "finished-completion-gap",
      priority: 4,
    });
    const ratings = candidate({
      id: "finished-ratings",
      category: "finished-ratings",
      kind: "relational",
      theme: "finished-rating-coverage",
      priority: 5,
    });
    expect(
      selectLibraryInsights([ratings, counter]).map((insight) => insight.id),
    ).toEqual(["finished-without-counter", "finished-ratings"]);
  });

  it("keeps distinct rating themes coexisting", () => {
    const favorite = candidate({
      id: "favorites-without-rating",
      category: "favorites-without-rating",
      kind: "relational",
      theme: "favorite-rating-gap",
      priority: 6,
    });
    const coverage = candidate({
      id: "rating-coverage",
      category: "rating-coverage",
      kind: "descriptive",
      theme: "rating-coverage",
      priority: 2,
    });
    expect(
      selectLibraryInsights([coverage, favorite]).map((insight) => insight.id),
    ).toEqual(["favorites-without-rating", "rating-coverage"]);
  });

  it("keeps a single insight per category/theme and is stable across calls", () => {
    const stats = allEligible();
    const first = buildLibraryInsights(stats);
    const second = buildLibraryInsights(stats);
    expect(first).toEqual(second);
    expect(new Set(first.map((insight) => insight.category)).size).toBe(first.length);
    expect(new Set(first.map((insight) => insight.theme)).size).toBe(first.length);
    expect(new Set(first.map((insight) => insight.id)).size).toBe(first.length);
  });

  it("keeps orphaned games visible by name placeholder in observations", () => {
    const insights = buildLibraryInsights(
      input({
        totalHours: 20,
        gamesWithHours: 2,
        topHours: [
          { name: "Jogo indisponível", value: 16 },
          { name: "Jogo B", value: 4 },
        ],
      }),
    );
    const hours = insights.find((insight) => insight.id === "hours-concentration");
    expect(hours?.description).toContain("Jogo indisponível");
  });

  it("never divides by zero denominators", () => {
    const stats = input({
      totalGames: 0,
      byStatus: {},
      ratedGames: 0,
      byRating: {},
      averageRating: null,
      totalHours: 0,
      gamesWithHours: 0,
      favoriteGames: 0,
      finishedGames: 0,
      finishedRated: 0,
      finishedWithoutCompletion: 0,
      topHours: [],
    });
    expect(() => buildLibraryInsights(stats)).not.toThrow();
    expect(formatPercent(Number.NaN)).toBe("0,0%");
    expect(ids(stats)).toEqual([]);
  });

  it("never presents unsupported inferences or empty justification", () => {
    const insights = buildLibraryInsights(allEligible());
    for (const insight of insights) {
      expect(Object.keys(insight.values).length).toBeGreaterThan(0);
      expect(insight.description).not.toMatch(
        /dívida|problema|deveria|incorreto|erro de cadastro|preferência|favorito é/i,
      );
    }
  });

  it("pluralizes and formats numbers for pt-BR", () => {
    expect(formatInteger(1000)).toBe("1.000");
    expect(formatPercent(0.0588)).toBe("5,9%");
    expect(formatHours(28.5)).toBe("28,5");
    expect(gamesLabel(1)).toBe("1 jogo");
    expect(gamesLabel(2)).toBe("2 jogos");
    expect(plural(1, "jogo está", "jogos estão")).toBe("jogo está");
    expect(plural(2, "jogo está", "jogos estão")).toBe("jogos estão");
  });

  it("uses singular verbs for a single finished or favorite game", () => {
    const finished = buildLibraryInsights(
      input({ finishedGames: 3, finishedRated: 0, finishedWithoutCompletion: 1 }),
    ).find((insight) => insight.id === "finished-without-counter");
    expect(finished?.description).toContain("1 dos seus 3 jogos");
    expect(finished?.description).toContain("não possui");

    const favorite = buildLibraryInsights(
      input({ favoriteGames: 2, favoriteUnrated: 1 }),
    ).find((insight) => insight.id === "favorites-without-rating");
    expect(favorite?.description).toContain("1 dos seus 2 jogos favoritos");
    expect(favorite?.description).toContain("ainda não possui");
  });
});
