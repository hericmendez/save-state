/**
 * Dashboard — pure view model (no JSX, no I/O, no ATP).
 *
 * Maps the existing getGameStats contract to display labels. Source fields
 * are documented per card so renames never silently change semantics:
 * "Jogos no Backlog" is totalGames (all user games, not a status), and
 * "Jogos Favoritos" is the totalFavorites COUNT (not a favorite game).
 */

import type { GameStats } from "@/server/stats/service";

export interface DashboardCardDef {
  id: string;
  label: string;
  format: (stats: GameStats) => string;
}

function formatInteger(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatRating(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

/** Primary cards: answer "how many / how much" at a glance. */
export const PRIMARY_CARDS: DashboardCardDef[] = [
  { id: "backlog", label: "Jogos no Backlog", format: (s) => formatInteger(s.totalGames) },
  { id: "hours", label: "Horas jogadas", format: (s) => formatInteger(s.totalHoursPlayed) },
  { id: "favorites", label: "Jogos Favoritos", format: (s) => formatInteger(s.totalFavorites) },
  { id: "rating", label: "Nota média", format: (s) => formatRating(s.averageRating) },
];

/** Secondary cards: completion details, all pre-existing values. */
export const SECONDARY_CARDS: DashboardCardDef[] = [
  { id: "finished", label: "Jogos zerados", format: (s) => formatInteger(s.totalFinished) },
  { id: "times-finished", label: "Vezes finalizado", format: (s) => formatInteger(s.totalTimesFinished) },
  { id: "fully-completed", label: "100% completados", format: (s) => formatInteger(s.totalFullyCompleted) },
  { id: "platinum", label: "Platinas (100%)", format: (s) => formatInteger(s.totalAchievementsCompleted) },
];

export interface DashboardDistributionDef {
  id: string;
  title: string;
  limit: number;
  select: (stats: GameStats) => Record<string, number>;
}

export const DISTRIBUTIONS: DashboardDistributionDef[] = [
  { id: "status", title: "Por status", limit: 10, select: (s) => s.byStatus },
  { id: "genre", title: "Gêneros favoritos", limit: 8, select: (s) => s.byGenre },
  { id: "platform", title: "Plataformas favoritas", limit: 8, select: (s) => s.byPlatform },
  { id: "year", title: "Por ano de lançamento", limit: 10, select: (s) => s.byReleaseYear },
];

/** Top entries by count (statistical view, not a ranking of games). */
export function topEntries(
  entries: Record<string, number>,
  limit: number,
): [string, number][] {
  return Object.entries(entries)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

export function maxEntryValue(entries: [string, number][]): number {
  return entries.length > 0 ? entries[0][1] : 0;
}

export function isEmptyDashboard(stats: GameStats): boolean {
  return stats.totalGames === 0;
}
