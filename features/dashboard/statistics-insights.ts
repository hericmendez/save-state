/**
 * Deterministic library-insights engine.
 *
 * Pure functions: it receives already-aggregated personal statistics and
 * returns textual observations. No LLM, no randomness, no I/O, no inference
 * about preferences or habits. Every claim is backed by counts that are
 * included in the insight payload.
 *
 * Phase 1.2 splits discoveries into two classes:
 * - relational: cross two or more personal attributes (status × counter,
 *   status × rating, favorite × rating);
 * - descriptive: summarize a single dimension already plotted below.
 *
 * Relational discoveries are selected first; descriptive ones complement them
 * when slots remain. This keeps the section from becoming a second rendering
 * of the same charts.
 *
 * The input contract is intentionally structural, so `PersonalStatistics`
 * (which has extra fields) can be passed directly.
 */

import {
  formatAverageRating,
  formatHours,
  formatInteger,
  formatPercent,
  gamesLabel,
  plural,
} from "./statistics-format";

export interface InsightInput {
  totalGames: number;
  byStatus: Record<string, number>;
  ratedGames: number;
  byRating: Record<string, number>;
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
  topHours: { name: string; value: number }[];
}

export type InsightCategory =
  | "backlog-concentration"
  | "rating-coverage"
  | "hours-concentration"
  | "finished-without-counter"
  | "finished-ratings"
  | "favorites-without-rating";

/**
 * Semantic theme used for deduplication. Categories are technical identifiers;
 * themes describe the question being answered, so two rules about the same
 * subject can be recognized even if their categories differ.
 */
export type InsightTheme =
  | "status-composition"
  | "rating-coverage"
  | "hours-concentration"
  | "finished-completion-gap"
  | "finished-rating-coverage"
  | "favorite-rating-gap";

export type InsightKind = "relational" | "descriptive";

export interface Insight {
  /** Stable identifier, independent of the rendered text. */
  id: InsightCategory;
  category: InsightCategory;
  kind: InsightKind;
  theme: InsightTheme;
  title: string;
  description: string;
  /** Lower numbers are shown first within the same kind. */
  priority: number;
  /** Quantitative values that justify the observation. */
  values: Record<string, number | string>;
}

/**
 * UX thresholds. These are heuristics, not statistical laws; they keep the
 * engine from presenting fragile observations as general conclusions.
 */
export const LIBRARY_INSIGHT_THRESHOLDS = {
  minLibraryForShare: 5,
  backlogShare: 0.8,
  maxRatingCoverage: 0.25,
  minGamesWithHours: 2,
  minTotalHours: 10,
  hoursDominance: 0.7,
  minFinishedForRatingInsight: 5,
  minFavoritesForRatingInsight: 2,
} as const;

export const MAX_LIBRARY_INSIGHTS = 3;

/**
 * Relational discoveries get the first two slots. The third slot, when
 * available, is a descriptive complement. This is a product choice, not a
 * rigid quota: with fewer relational discoveries the free slots are filled
 * with descriptive ones, and the engine never invents observations to reach
 * three.
 */
export const MAX_RELATIONAL_INSIGHTS = 2;

function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function backlogInsight(input: InsightInput): Insight | null {
  const threshold = LIBRARY_INSIGHT_THRESHOLDS;
  if (input.totalGames < threshold.minLibraryForShare) return null;
  const backlog = input.byStatus.backlog ?? 0;
  const ratio = share(backlog, input.totalGames);
  if (ratio <= threshold.backlogShare) return null;
  return {
    id: "backlog-concentration",
    category: "backlog-concentration",
    kind: "descriptive",
    theme: "status-composition",
    title: "Concentração no Backlog",
    description: `${formatPercent(ratio)} da sua biblioteca está no Backlog — ${formatInteger(backlog)} de ${gamesLabel(input.totalGames)}.`,
    priority: 1,
    values: { backlogCount: backlog, totalGames: input.totalGames, share: ratio },
  };
}

function ratingCoverageInsight(input: InsightInput): Insight | null {
  const threshold = LIBRARY_INSIGHT_THRESHOLDS;
  if (input.totalGames < threshold.minLibraryForShare) return null;
  // No ratings means no measurable coverage; the module's empty state covers it.
  if (input.ratedGames <= 0) return null;
  const ratio = share(input.ratedGames, input.totalGames);
  if (ratio >= threshold.maxRatingCoverage) return null;
  const average =
    input.averageRating === null
      ? ""
      : ` A média de ${formatAverageRating(input.averageRating)}/10 considera apenas ${gamesLabel(input.ratedGames)} com nota.`;
  return {
    id: "rating-coverage",
    category: "rating-coverage",
    kind: "descriptive",
    theme: "rating-coverage",
    title: "Cobertura de avaliações",
    description: `${formatPercent(ratio)} da sua biblioteca possui avaliação — ${formatInteger(input.ratedGames)} de ${gamesLabel(input.totalGames)}.${average}`,
    priority: 2,
    values: {
      ratedGames: input.ratedGames,
      totalGames: input.totalGames,
      share: ratio,
      ...(input.averageRating === null ? {} : { averageRating: input.averageRating }),
    },
  };
}

function hoursConcentrationInsight(input: InsightInput): Insight | null {
  const threshold = LIBRARY_INSIGHT_THRESHOLDS;
  if (input.gamesWithHours < threshold.minGamesWithHours) return null;
  if (input.totalHours < threshold.minTotalHours) return null;
  const top = input.topHours[0];
  if (!top || top.value <= 0) return null;
  const ratio = share(top.value, input.totalHours);
  if (ratio <= threshold.hoursDominance) return null;
  return {
    id: "hours-concentration",
    category: "hours-concentration",
    kind: "descriptive",
    theme: "hours-concentration",
    title: "Horas concentradas em um jogo",
    description: `Um único jogo concentra ${formatPercent(ratio)} das horas registradas: ${top.name} representa ${formatHours(top.value)} de ${formatHours(input.totalHours)} horas informadas.`,
    priority: 3,
    values: {
      gameName: top.name,
      gameHours: top.value,
      totalHours: input.totalHours,
      gamesWithHours: input.gamesWithHours,
      share: ratio,
    },
  };
}

function finishedWithoutCounterInsight(input: InsightInput): Insight | null {
  const count = input.finishedWithoutCompletion;
  if (count <= 0) return null;
  return {
    id: "finished-without-counter",
    category: "finished-without-counter",
    kind: "relational",
    theme: "finished-completion-gap",
    title: "Finalizados sem conclusão no contador",
    description: `${formatInteger(count)} dos seus ${gamesLabel(input.finishedGames)} no status Finalizado ${plural(count, "não possui", "não possuem")} conclusão registrada no contador. Status e contador são informações independentes.`,
    priority: 4,
    values: {
      finishedWithoutCompletion: count,
      finishedGames: input.finishedGames,
      gamesWithTimesFinished: input.gamesWithTimesFinished,
    },
  };
}

function finishedRatingsInsight(input: InsightInput): Insight | null {
  const threshold = LIBRARY_INSIGHT_THRESHOLDS;
  if (input.finishedGames < threshold.minFinishedForRatingInsight) return null;
  // Trivial cases (none or all) add little beyond the module itself.
  if (input.finishedRated <= 0 || input.finishedRated >= input.finishedGames) {
    return null;
  }
  const ratio = share(input.finishedRated, input.finishedGames);
  return {
    id: "finished-ratings",
    category: "finished-ratings",
    kind: "relational",
    theme: "finished-rating-coverage",
    title: "Avaliações entre finalizados",
    description: `${formatInteger(input.finishedRated)} dos seus ${gamesLabel(input.finishedGames)} finalizados ${plural(input.finishedRated, "recebeu", "receberam")} uma nota (${formatPercent(ratio)}).`,
    priority: 5,
    values: {
      finishedRated: input.finishedRated,
      finishedGames: input.finishedGames,
      share: ratio,
    },
  };
}

function favoritesWithoutRatingInsight(input: InsightInput): Insight | null {
  const threshold = LIBRARY_INSIGHT_THRESHOLDS;
  if (input.favoriteGames < threshold.minFavoritesForRatingInsight) return null;
  if (input.favoriteUnrated <= 0) return null;
  return {
    id: "favorites-without-rating",
    category: "favorites-without-rating",
    kind: "relational",
    theme: "favorite-rating-gap",
    title: "Favoritos sem nota",
    description: `${formatInteger(input.favoriteUnrated)} dos seus ${gamesLabel(input.favoriteGames)} favoritos ${plural(input.favoriteUnrated, "ainda não possui", "ainda não possuem")} avaliação. Favorito e avaliação são marcações independentes.`,
    priority: 6,
    values: {
      favoriteUnrated: input.favoriteUnrated,
      favoriteGames: input.favoriteGames,
    },
  };
}

function compareInsights(a: Insight, b: Insight): number {
  if (a.kind !== b.kind) return a.kind === "relational" ? -1 : 1;
  return a.priority - b.priority || a.id.localeCompare(b.id);
}

/**
 * Deterministic selection over already-built candidates.
 *
 * 1. Order by kind (relational first) and then by priority/id.
 * 2. Deduplicate by technical category and by semantic theme, keeping the
 *    first occurrence in that order. A relational candidate therefore wins
 *    over a descriptive one that would repeat the same theme.
 * 3. Reserve at most `MAX_RELATIONAL_INSIGHTS` slots for relational
 *    discoveries and fill the rest with descriptive complements.
 * 4. Cap at `MAX_LIBRARY_INSIGHTS`; never pad the list.
 */
export function selectLibraryInsights(candidates: readonly Insight[]): Insight[] {
  const seenCategories = new Set<InsightCategory>();
  const seenThemes = new Set<InsightTheme>();
  const deduped: Insight[] = [];

  for (const insight of [...candidates].sort(compareInsights)) {
    if (seenCategories.has(insight.category)) continue;
    if (seenThemes.has(insight.theme)) continue;
    seenCategories.add(insight.category);
    seenThemes.add(insight.theme);
    deduped.push(insight);
  }

  const relational = deduped
    .filter((insight) => insight.kind === "relational")
    .slice(0, MAX_RELATIONAL_INSIGHTS);
  const descriptive = deduped.filter((insight) => insight.kind === "descriptive");
  const remaining = MAX_LIBRARY_INSIGHTS - relational.length;

  return [...relational, ...descriptive.slice(0, Math.max(0, remaining))];
}

/**
 * Builds at most `MAX_LIBRARY_INSIGHTS` observations.
 *
 * Every rule is evaluated; relational results are prioritized, descriptive
 * results complement them, and fewer than three insights is a valid outcome.
 */
export function buildLibraryInsights(input: InsightInput): Insight[] {
  const candidates = [
    backlogInsight(input),
    ratingCoverageInsight(input),
    hoursConcentrationInsight(input),
    finishedWithoutCounterInsight(input),
    finishedRatingsInsight(input),
    favoritesWithoutRatingInsight(input),
  ].filter((insight): insight is Insight => insight !== null);

  return selectLibraryInsights(candidates);
}
