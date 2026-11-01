/**
 * Etapa 2 — neutral search BFF schema: sort, year range, title-optional.
 */

import { describe, expect, it } from "vitest";
import { searchQuerySchema } from "@/schemas/search";

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
