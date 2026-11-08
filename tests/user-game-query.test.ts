/**
 * Fase 3 — library URL bridge: URL → CollectionQuery → service filters,
 * keeping Fase 2 foundation conventions (defaults omitted, invalid values
 * fall back predictably).
 */

import { describe, expect, it } from "vitest";
import {
  parseLibrarySearchParams,
  toLibraryServiceFilters,
} from "@/features/games/user-game-query";

describe("library URL bridge", () => {
  it("parses page URL params into a collection query", () => {
    const query = parseLibrarySearchParams(
      new URLSearchParams(
        "search=zelda&platform=N64&yearFrom=1990&yearTo=2000&status=playing&orderBy=title&order=desc&page=3&limit=50&viewMode=list",
      ),
    );
    expect(query).toEqual({
      search: "zelda",
      platform: "N64",
      family: "",
      yearFrom: 1990,
      yearTo: 2000,
      status: "playing",
      orderBy: "title",
      order: "desc",
      page: 3,
      limit: 50,
      viewMode: "list",
    });
  });

  it("maps a query to service filters, dropping empties", () => {
    const filters = toLibraryServiceFilters(
      parseLibrarySearchParams(new URLSearchParams("search=mario&page=2")),
    );
    expect(filters).toEqual({ search: "mario", page: 2, limit: 20 });
  });

  it("keeps explicit ordering for the service", () => {
    const filters = toLibraryServiceFilters(
      parseLibrarySearchParams(
        new URLSearchParams("orderBy=releaseYear&order=desc"),
      ),
    );
    expect(filters).toEqual({
      orderBy: "releaseYear",
      order: "desc",
      page: 1,
      limit: 20,
    });
  });
});
