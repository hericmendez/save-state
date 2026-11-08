/**
 * Fase 5 — dashboard view model: approved labels bound to the existing
 * getGameStats contract. No ATP, no rankings, no new aggregations.
 *
 * Redesign: distributions are status/genre/release-year only (platforms
 * removed), rendered as tables with no arbitrary slicing.
 */

import { describe, expect, it } from "vitest";
import type { GameStats } from "@/server/stats/service";
import {
  DISTRIBUTIONS,
  PRIMARY_CARDS,
  SECONDARY_CARDS,
  isEmptyDashboard,
  topEntries,
} from "@/features/dashboard/dashboard-metrics";

function statsFixture(overrides: Partial<GameStats> = {}): GameStats {
  return {
    totalGames: 0,
    totalHoursPlayed: 0,
    totalTimesFinished: 0,
    averageRating: null,
    averageHoursPlayed: 0,
    averageTimesFinished: 0,
    totalFinished: 0,
    totalFavorites: 0,
    totalFullyCompleted: 0,
    totalAchievementsCompleted: 0,
    averageAchievementProgress: null,
    byStatus: {},
    byGenre: {},
    byPlatform: {},
    byDeveloper: {},
    byPublisher: {},
    byReleaseYear: {},
    byRating: {},
    ...overrides,
  };
}

describe("dashboard labels", () => {
  it("presents totalGames as Jogos no Backlog", () => {
    const card = PRIMARY_CARDS.find((c) => c.label === "Jogos no Backlog");
    expect(card?.format(statsFixture({ totalGames: 42 }))).toBe("42");
  });

  it("presents totalFavorites as a Jogos Favoritos count", () => {
    const card = PRIMARY_CARDS.find((c) => c.label === "Jogos Favoritos");
    expect(card?.format(statsFixture({ totalFavorites: 7 }))).toBe("7");
  });

  it("preserves the remaining pre-existing metrics", () => {
    const byLabel = new Map(
      [...PRIMARY_CARDS, ...SECONDARY_CARDS].map((c) => [c.label, c]),
    );
    const stats = statsFixture({
      totalHoursPlayed: 120,
      averageRating: 8.55,
      totalFinished: 3,
      totalTimesFinished: 5,
      totalFullyCompleted: 1,
      totalAchievementsCompleted: 2,
    });
    expect(byLabel.get("Horas jogadas")?.format(stats)).toBe("120");
    expect(byLabel.get("Nota média")?.format(stats)).toBe("8.6");
    expect(byLabel.get("Nota média")?.format(statsFixture())).toBe("—");
    expect(byLabel.get("Jogos zerados")?.format(stats)).toBe("3");
    expect(byLabel.get("Vezes finalizado")?.format(stats)).toBe("5");
    expect(byLabel.get("100% completados")?.format(stats)).toBe("1");
    expect(byLabel.get("Platinas (100%)")?.format(stats)).toBe("2");
  });
});

describe("dashboard distributions", () => {
  it("covers status, genre and platform from existing data", () => {
    expect(DISTRIBUTIONS.map((d) => d.id).sort()).toEqual([
      "genre",
      "platform",
      "status",
    ]);
    const stats = statsFixture({
      byStatus: { playing: 2, backlog: 1 },
      byGenre: { RPG: 2 },
      byPlatform: { N64: 2 },
    });
    for (const def of DISTRIBUTIONS) {
      expect(Object.keys(def.select(stats)).length).toBeGreaterThan(0);
    }
  });

  it("orders full frequency lists by count without slicing", () => {
    expect(topEntries({ a: 1, b: 5, c: 3 })).toEqual([
      ["b", 5],
      ["c", 3],
      ["a", 1],
    ]);
  });

  it("detects an empty library", () => {
    expect(isEmptyDashboard(statsFixture())).toBe(true);
    expect(isEmptyDashboard(statsFixture({ totalGames: 1 }))).toBe(false);
  });
});
