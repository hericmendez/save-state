/**
 * Home — pure helpers (no JSX, no I/O).
 *
 * `pickSpotlightWinner` mirrors the `mostHours` facet in
 * `server/home/service.ts` (`hoursPlayed > 0`, sort `hoursPlayed desc`,
 * `_id` asc) so the deterministic tie-break is unit-testable without a
 * database. The service remains the runtime source of truth; this helper
 * documents and locks the rule.
 *
 * Highlight selection (`pickHighlightKinds`) is pure and runs on the
 * server per page load: the client receives fixed props, so there is no
 * hydration mismatch and no re-roll on re-renders.
 */

import type { Game } from "@/features/shared/types";

export interface SpotlightCandidate {
  _id: string;
  hoursPlayed: number;
}

export function pickSpotlightWinner<T extends SpotlightCandidate>(
  games: T[],
): T | null {
  let winner: T | null = null;
  for (const game of games) {
    if (!(game.hoursPlayed > 0)) continue;
    if (
      winner === null ||
      game.hoursPlayed > winner.hoursPlayed ||
      (game.hoursPlayed === winner.hoursPlayed && game._id < winner._id)
    ) {
      winner = game;
    }
  }
  return winner;
}

export const HIGHLIGHT_KINDS = [
  "most-hours",
  "top-rated",
  "most-finished",
  "top-platform",
  "top-genre",
  "random-favorite",
  "recent-finish",
  "recently-added",
  "wishlist",
  "bucha",
] as const;

export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number];

export interface HighlightCategory {
  name: string;
  games: number;
  hours: number;
}

export type GameHighlightKind =
  | "most-hours"
  | "top-rated"
  | "most-finished"
  | "random-favorite"
  | "recent-finish"
  | "recently-added"
  | "wishlist"
  | "bucha";

export interface GameHighlight {
  kind: GameHighlightKind;
  title: string;
  game: Game;
  /** Null for kinds without a metric (random favorite, wishlist). */
  metric: string | null;
}

export interface CategoryHighlight {
  kind: "top-platform" | "top-genre";
  title: string;
  name: string;
  games: number;
  hours: number;
}

export type Highlight = GameHighlight | CategoryHighlight;

export interface DatedGame {
  game: Game;
  /** Pre-formatted pt-BR date (formatted server-side from a real date). */
  date: string;
}

export interface HighlightSource {
  mostHours: Game | null;
  topRated: Game | null;
  mostFinished: Game | null;
  randomFavorite: Game | null;
  topPlatform: HighlightCategory | null;
  topGenre: HighlightCategory | null;
  recentFinish: DatedGame | null;
  recentlyAdded: DatedGame | null;
  wishlist: Game | null;
  bucha: Game | null;
}

function formatInteger(value: number): string {
  return value.toLocaleString("pt-BR");
}

/**
 * Short pt-BR calendar date from a real stored date. UTC keeps the
 * rendering deterministic regardless of the server timezone.
 */
export function formatShortDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Build one highlight from already-resolved data, or `null` when the
 * kind has insufficient data. Never fabricates values.
 */
export function buildHighlight(
  kind: HighlightKind,
  source: HighlightSource,
): Highlight | null {
  switch (kind) {
    case "most-hours": {
      const game = source.mostHours;
      if (!game || typeof game.hoursPlayed !== "number") return null;
      return {
        kind,
        title: "Mais horas jogadas",
        game,
        metric: `${formatInteger(game.hoursPlayed)}h jogadas`,
      };
    }
    case "top-rated": {
      const game = source.topRated;
      if (!game || typeof game.rating !== "number") return null;
      return {
        kind,
        title: "Jogo mais bem avaliado",
        game,
        metric: `${game.rating}/10`,
      };
    }
    case "most-finished": {
      const game = source.mostFinished;
      if (!game || typeof game.timesFinished !== "number") return null;
      return {
        kind,
        title: "Jogo zerado mais vezes",
        game,
        metric: `Zerado ${formatInteger(game.timesFinished)}×`,
      };
    }
    case "top-platform": {
      const category = source.topPlatform;
      if (!category) return null;
      return {
        kind,
        title: "Plataforma mais jogada",
        name: category.name,
        games: category.games,
        hours: category.hours,
      };
    }
    case "top-genre": {
      const category = source.topGenre;
      if (!category) return null;
      return {
        kind,
        title: "Gênero mais jogado",
        name: category.name,
        games: category.games,
        hours: category.hours,
      };
    }
    case "random-favorite": {
      const game = source.randomFavorite;
      if (!game) return null;
      return { kind, title: "Um de seus favoritos", game, metric: null };
    }
    case "recent-finish": {
      const dated = source.recentFinish;
      if (!dated) return null;
      return {
        kind,
        title: "Zerado mais recentemente",
        game: dated.game,
        metric: dated.date,
      };
    }
    case "recently-added": {
      const dated = source.recentlyAdded;
      if (!dated) return null;
      return {
        kind,
        title: "Adicionado ao backlog",
        game: dated.game,
        metric: dated.date,
      };
    }
    case "wishlist": {
      const game = source.wishlist;
      if (!game) return null;
      return { kind, title: "Quero jogar", game, metric: null };
    }
    case "bucha": {
      const game = source.bucha;
      if (!game || typeof game.rating !== "number") return null;
      return {
        kind,
        title: "Bucha Awards",
        game,
        metric: `${game.rating}/10`,
      };
    }
  }
}

/**
 * Illustrative icon for category highlights (platform, genre, or any
 * future kind about a concept instead of a specific game). Game
 * highlights return `null` and render the game's cover instead — never
 * a random cover for a category, never an icon for a specific game.
 *
 * Extension rule: new category-like kinds map to an icon here.
 */
export type CategoryIcon = "gamepad-2" | "sword";

export function highlightIcon(
  highlight: CategoryHighlight,
): CategoryIcon;
export function highlightIcon(highlight: Highlight): CategoryIcon | null;
export function highlightIcon(highlight: Highlight): CategoryIcon | null {
  if (highlight.kind === "top-platform") return "gamepad-2";
  if (highlight.kind === "top-genre") return "sword";
  return null;
}

/** Draw one item (Bucha tie pool, or any single draw) or `null`. */
export function drawOne<T>(
  items: T[],
  random: () => number = Math.random,
): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(random() * items.length)] ?? null;
}

/**
 * Draw up to two distinct kinds from the valid ones (Fisher-Yates with
 * an injectable random source, so tests can seed it). Shuffling — not
 * slicing the registration order — guarantees the draw never depends
 * on the order the kinds were registered in.
 */
export function pickHighlightKinds(
  validKinds: HighlightKind[],
  random: () => number = Math.random,
): HighlightKind[] {
  const pool = [...validKinds];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 2);
}

/**
 * First three entries of the personal Top 10, preserving the user's
 * order exactly. Fewer than three returns whatever is available.
 */
export function takeTopThree<T>(top10: T[]): T[] {
  return top10.slice(0, 3);
}
