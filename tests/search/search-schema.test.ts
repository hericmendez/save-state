/**
 * Etapa 2 — neutral search BFF schema: sort, year range, title-optional.
 */

import { describe, expect, it } from "vitest";
import { searchImportSchema, searchQuerySchema } from "@/schemas/search";

describe("searchQuerySchema — Etapa 2", () => {
  it("accepts a title-only search", () => {
    const parsed = searchQuerySchema.safeParse({ q: "chrono" });
    expect(parsed.success).toBe(true);
  });

  it("accepts a filter-only search without title (thematic-URL ready)", () => {
    const parsed = searchQuerySchema.safeParse({
      genre: "RPG",
      publisher: "Nintendo",
      yearMin: "2000",
      yearMax: "2010",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.genre).toBe("RPG");
      expect(parsed.data.yearMin).toBe(2000);
      expect(parsed.data.yearMax).toBe(2010);
    }
  });

  it("rejects an empty search without filters", () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "  " }).success).toBe(false);
  });

  it("accepts and defaults the sort contract", () => {
    const plain = searchQuerySchema.safeParse({ q: "mario" });
    expect(plain.success).toBe(true);
    if (plain.success) {
      expect(plain.data.sortBy).toBeUndefined();
      expect(plain.data.order).toBeUndefined();
    }
    const sorted = searchQuerySchema.safeParse({
      q: "mario",
      sortBy: "title",
      order: "desc",
    });
    expect(sorted.success).toBe(true);
    if (sorted.success) {
      expect(sorted.data.sortBy).toBe("title");
      expect(sorted.data.order).toBe("desc");
    }
    expect(
      searchQuerySchema.safeParse({ q: "mario", sortBy: "bogus" }).success,
    ).toBe(false);
  });

  it("maps the legacy single year onto both range bounds", () => {
    const parsed = searchQuerySchema.safeParse({ q: "chrono", year: "1995" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.yearMin).toBe(1995);
      expect(parsed.data.yearMax).toBe(1995);
    }
  });

  it("rejects an inverted year range", () => {
    expect(
      searchQuerySchema.safeParse({
        genre: "RPG",
        yearMin: "2010",
        yearMax: "2000",
      }).success,
    ).toBe(false);
  });

  it("keeps the family key for route-locked contexts", () => {
    const parsed = searchQuerySchema.safeParse({
      q: "mario",
      family: "Nintendo",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.family).toBe("Nintendo");
  });
});

describe("searchImportSchema — edit-and-add personal + conflict policy", () => {
  it("accepts a bare external id (legacy callers unchanged)", () => {
    const parsed = searchImportSchema.safeParse({ externalId: "1234" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.personal).toBeUndefined();
      expect(parsed.data.conflictPolicy).toBeUndefined();
    }
  });

  it("accepts all nine personal fields with the createGame rules", () => {
    const parsed = searchImportSchema.safeParse({
      externalId: "1234",
      personal: {
        status: "playing",
        hoursPlayed: 12,
        timesFinished: 1,
        rating: 9,
        review: { content: "Obra-prima." },
        favorite: true,
        fullyCompleted: false,
        achievements: true,
        achievementProgress: 80,
      },
      conflictPolicy: "reject-existing",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a structured Markdown review (Phase 3, single request)", () => {
    const parsed = searchImportSchema.safeParse({
      externalId: "1234",
      personal: {
        status: "backlog",
        review: { content: "# Jogão\n\nMuito bom." },
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.personal?.review).toEqual({
        content: "# Jogão\n\nMuito bom.",
      });
    }
  });

  it("rejects achievementProgress without achievements", () => {
    expect(
      searchImportSchema.safeParse({
        externalId: "1234",
        personal: { achievements: false, achievementProgress: 50 },
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range personal values", () => {
    expect(
      searchImportSchema.safeParse({
        externalId: "1234",
        personal: { rating: 11 },
      }).success,
    ).toBe(false);
    expect(
      searchImportSchema.safeParse({
        externalId: "1234",
        personal: { status: "unknown" },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown conflict policies", () => {
    expect(
      searchImportSchema.safeParse({
        externalId: "1234",
        conflictPolicy: "merge",
      }).success,
    ).toBe(false);
  });
});

describe("searchQuerySchema — índice alfanumérico", () => {
  it("accepts letter, digit and symbol initials", () => {
    for (const initial of ["M", "Z", "0-9", "#"]) {
      const parsed = searchQuerySchema.safeParse({ q: "mario", initial });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.initial).toBe(initial);
    }
  });

  it("accepts an initial-only browse (no text needed)", () => {
    const parsed = searchQuerySchema.safeParse({ initial: "M" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.initial).toBe("M");
  });

  it("rejects unknown initials", () => {
    expect(
      searchQuerySchema.safeParse({ q: "mario", initial: "todos" }).success,
    ).toBe(false);
    expect(
      searchQuerySchema.safeParse({ q: "mario", initial: "AB" }).success,
    ).toBe(false);
    expect(
      searchQuerySchema.safeParse({ q: "mario", initial: "m" }).success,
    ).toBe(false);
  });
});
