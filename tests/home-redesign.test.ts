/**
 * Home redesign — pure rules: spotlight tie-break, empty states.
 * No DB, no HTTP, no ATP.
 */

import { describe, expect, it } from "vitest";
import type { Game } from "@/features/shared/types";
import { readFileSync } from "fs";
import {
  buildHighlight,
  drawOne,
  formatShortDate,
  HIGHLIGHT_KINDS,
  highlightIcon,
  pickHighlightKinds,
  pickSpotlightWinner,
  takeTopThree,
  type HighlightKind,
  type HighlightSource,
} from "@/features/home/home-metrics";
import {
  DISTRIBUTIONS,
  topEntries,
} from "@/features/dashboard/dashboard-metrics";

describe("spotlight winner (most hours, deterministic)", () => {
  it("ignores games without recorded hours", () => {
    expect(
      pickSpotlightWinner([
        { _id: "a", hoursPlayed: 0 },
        { _id: "b", hoursPlayed: 0 },
      ]),
    ).toBeNull();
    expect(pickSpotlightWinner([])).toBeNull();
  });

  it("picks the highest hoursPlayed", () => {
    const winner = pickSpotlightWinner([
      { _id: "a", hoursPlayed: 5 },
      { _id: "b", hoursPlayed: 42 },
      { _id: "c", hoursPlayed: 10 },
    ]);
    expect(winner?._id).toBe("b");
  });

  it("breaks ties deterministically by _id asc", () => {
    const winner = pickSpotlightWinner([
      { _id: "b", hoursPlayed: 10 },
      { _id: "a", hoursPlayed: 10 },
      { _id: "c", hoursPlayed: 10 },
    ]);
    expect(winner?._id).toBe("a");
  });

  it("treats NaN/negative as no hours", () => {
    expect(
      pickSpotlightWinner([
        { _id: "a", hoursPlayed: -3 },
        { _id: "b", hoursPlayed: Number.NaN },
      ]),
    ).toBeNull();
  });
});

/** Deterministic pseudo-random source for draw tests. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function gameFixture(overrides: Partial<Game> = {}): Game {
  return {
    _id: "ug1",
    hoursPlayed: 100,
    timesFinished: 3,
    rating: 9.8,
    game: { name: "Nuclear Throne", cover: "cover.png" },
    ...overrides,
  };
}

function fullSource(overrides: Partial<HighlightSource> = {}): HighlightSource {
  const game = gameFixture();
  return {
    mostHours: game,
    topRated: game,
    mostFinished: game,
    randomFavorite: game,
    topPlatform: { name: "PC", games: 40, hours: 600 },
    topGenre: { name: "Metroidvania", games: 22, hours: 250 },
    recentFinish: { game, date: "21/11/1998" },
    recentlyAdded: { game, date: "12/03/2024" },
    wishlist: game,
    bucha: gameFixture({ rating: 2 }),
    ...overrides,
  };
}

function emptySource(): HighlightSource {
  return {
    mostHours: null,
    topRated: null,
    mostFinished: null,
    randomFavorite: null,
    topPlatform: null,
    topGenre: null,
    recentFinish: null,
    recentlyAdded: null,
    wishlist: null,
    bucha: null,
  };
}

describe("pickHighlightKinds (two distinct draws)", () => {
  it("draws exactly two distinct kinds from the six available", () => {
    const picked = pickHighlightKinds([...HIGHLIGHT_KINDS], seededRandom(7));
    expect(picked).toHaveLength(2);
    expect(new Set(picked).size).toBe(2);
    for (const kind of picked) {
      expect(HIGHLIGHT_KINDS).toContain(kind);
    }
  });

  it("covers all ten kinds", () => {
    expect(HIGHLIGHT_KINDS).toHaveLength(10);
    expect(new Set(HIGHLIGHT_KINDS).size).toBe(10);
  });

  it("is a genuine draw: every kind can be picked across loads", () => {
    const seen = new Set<HighlightKind>();
    for (let seed = 1; seed <= 300; seed += 1) {
      for (const kind of pickHighlightKinds(
        [...HIGHLIGHT_KINDS],
        seededRandom(seed),
      )) {
        seen.add(kind);
      }
    }
    expect([...seen].sort()).toEqual([...HIGHLIGHT_KINDS].sort());
  });

  it("varies the pair across loads instead of repeating one", () => {
    const pairs = new Set<string>();
    for (let seed = 1; seed <= 50; seed += 1) {
      pairs.add(
        pickHighlightKinds([...HIGHLIGHT_KINDS], seededRandom(seed))
          .sort()
          .join("+"),
      );
    }
    expect(pairs.size).toBeGreaterThan(1);
  });

  it("fills with whatever is valid when fewer than two kinds qualify", () => {
    expect(pickHighlightKinds(["most-hours"], seededRandom(1))).toEqual([
      "most-hours",
    ]);
    expect(pickHighlightKinds([], seededRandom(1))).toEqual([]);
  });

  it("never duplicates a kind", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const picked = pickHighlightKinds(
        [...HIGHLIGHT_KINDS] as HighlightKind[],
        seededRandom(seed),
      );
      expect(new Set(picked).size).toBe(picked.length);
    }
  });
});

describe("buildHighlight (formatting and missing data)", () => {
  it("formats every game kind from real data", () => {
    expect(buildHighlight("most-hours", fullSource())).toMatchObject({
      title: "Mais horas jogadas",
      metric: "100h jogadas",
    });
    expect(buildHighlight("top-rated", fullSource())).toMatchObject({
      title: "Jogo mais bem avaliado",
      metric: "9.8/10",
    });
    expect(buildHighlight("most-finished", fullSource())).toMatchObject({
      title: "Jogo zerado mais vezes",
      metric: "Zerado 3×",
    });
    expect(buildHighlight("random-favorite", fullSource())).toMatchObject({
      title: "Um de seus favoritos",
      metric: null,
    });
  });

  it("formats category kinds with game and hour counts", () => {
    expect(buildHighlight("top-platform", fullSource())).toMatchObject({
      title: "Plataforma mais jogada",
      name: "PC",
      games: 40,
      hours: 600,
    });
    expect(buildHighlight("top-genre", fullSource())).toMatchObject({
      title: "Gênero mais jogado",
      name: "Metroidvania",
      games: 22,
      hours: 250,
    });
  });

  it("returns null instead of fabricating values when data is missing", () => {
    const empty = emptySource();
    for (const kind of HIGHLIGHT_KINDS) {
      expect(buildHighlight(kind, empty)).toBeNull();
    }
  });

  it("formats the four new game kinds from real data", () => {
    expect(buildHighlight("recent-finish", fullSource())).toMatchObject({
      title: "Zerado mais recentemente",
      metric: "21/11/1998",
    });
    expect(buildHighlight("recently-added", fullSource())).toMatchObject({
      title: "Adicionado ao backlog",
      metric: "12/03/2024",
    });
    expect(buildHighlight("wishlist", fullSource())).toMatchObject({
      title: "Quero jogar",
      metric: null,
    });
    expect(buildHighlight("bucha", fullSource())).toMatchObject({
      title: "Bucha Awards",
      metric: "2/10",
    });
  });
});

describe("drawOne (single draws: Bucha ties)", () => {
  it("draws one item or null when empty", () => {
    expect(drawOne(["a", "b", "c"], () => 0)).toBe("a");
    expect(drawOne([], seededRandom(1))).toBeNull();
  });

  it("can reach every tied game across loads", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      seen.add(drawOne(["a", "b", "c"], seededRandom(seed))!);
    }
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("formatShortDate (real stored dates only)", () => {
  it("formats a UTC calendar date in pt-BR", () => {
    expect(formatShortDate(new Date("1998-11-21T00:00:00Z"))).toBe(
      "21/11/1998",
    );
    expect(formatShortDate("2024-03-12T15:00:00Z")).toBe("12/03/2024");
  });
});

describe("highlightIcon (covers for games, icons for categories)", () => {
  it("maps platform and genre to their illustrative icons", () => {
    expect(
      highlightIcon(buildHighlight("top-platform", fullSource())!),
    ).toBe("gamepad-2");
    expect(highlightIcon(buildHighlight("top-genre", fullSource())!)).toBe(
      "sword",
    );
  });

  it("uses covers (no icon) for every game highlight", () => {
    const source = fullSource();
    for (const kind of [
      "most-hours",
      "top-rated",
      "most-finished",
      "random-favorite",
      "recent-finish",
      "recently-added",
      "wishlist",
      "bucha",
    ] as const) {
      expect(highlightIcon(buildHighlight(kind, source)!)).toBeNull();
    }
  });

  it("never uses updatedAt as a substitute for real dates", () => {
    const service = readFileSync("server/home/service.ts", "utf8");
    expect(service).toContain("createdAt: -1");
    expect(service).toContain("lastFinishedAt: -1");
    expect(service).not.toMatch(/\$sort:\s*\{[^}]*updatedAt/);
    expect(service).not.toContain("updatedAt:");
    expect(service).not.toContain(".updatedAt");
  });

  it("resolves the recent finish from UserGame, never from Activity", () => {
    const service = readFileSync("server/home/service.ts", "utf8");
    expect(service).not.toContain("db/models/activity");
    expect(service).not.toContain("game.finished");
    expect(service).not.toContain("times_finished_changed");
  });

  it("renders icons for categories and covers for games", () => {
    const sections = readFileSync(
      "features/home/home-game-sections.tsx",
      "utf8",
    );
    expect(sections).toContain("FaGamepad");
    expect(sections).toContain("GiBroadsword");
    expect(sections).not.toContain("FaTags");
    expect(sections).toContain("CategoryBadge");
  });
});

describe("takeTopThree (order-preserving)", () => {
  it("takes the first three in the user's exact order", () => {
    expect(takeTopThree(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c"]);
  });

  it("shows whatever is available below three", () => {
    expect(takeTopThree(["a", "b"])).toEqual(["a", "b"]);
    expect(takeTopThree(["a"])).toEqual(["a"]);
    expect(takeTopThree([])).toEqual([]);
  });
});

describe("dashboard distributions (post-redesign contract)", () => {
  it("covers status, genre and platform only (no release year)", () => {
    expect(DISTRIBUTIONS.map((d) => d.id).sort()).toEqual([
      "genre",
      "platform",
      "status",
    ]);
  });

  it("returns full frequency lists ordered by count (no slicing)", () => {
    expect(
      topEntries({ a: 1, b: 5, c: 3 }),
    ).toEqual([
      ["b", 5],
      ["c", 3],
      ["a", 1],
    ]);
  });

});
