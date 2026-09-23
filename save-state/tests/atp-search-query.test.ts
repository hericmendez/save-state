/**
 * Fase 6 — Busca Geral URL state: parsing/serialization over the REAL BFF
 * contract only (q/search, platform, genre, year, developer, publisher,
 * page, limit, viewMode). Family/sort/year-ranges have no BFF correspondent
 * and are intentionally absent.
 */

import { describe, expect, it } from "vitest";
import {
  ATP_SEARCH_DEFAULTS,
  applyFixedContext,
  buildAtpBffSearchString,
  hasAtpSearch,
  parseAtpSearchQuery,
  serializeAtpSearchQuery,
  serializeWithFixedContext,
  toAtpBffParams,
} from "@/features/atp/atp-search-query";

describe("parseAtpSearchQuery", () => {
  it("returns defaults for empty input", () => {
    expect(parseAtpSearchQuery(undefined)).toEqual(ATP_SEARCH_DEFAULTS);
    expect(parseAtpSearchQuery(new URLSearchParams())).toEqual(
      ATP_SEARCH_DEFAULTS,
    );
  });

  it("parses a full valid query", () => {
    expect(
      parseAtpSearchQuery(
        new URLSearchParams(
          "search=chrono&platform=SNES&genre=RPG&year=1995&developer=Square&publisher=Square&family=Nintendo&page=2&limit=50&viewMode=list",
        ),
      ),
    ).toEqual({
      search: "chrono",
      platform: "SNES",
      genre: "RPG",
      year: 1995,
      developer: "Square",
      publisher: "Square",
      family: "Nintendo",
      page: 2,
      limit: 50,
      viewMode: "list",
      order: "asc",
    });
  });

  it("falls back predictably for invalid values", () => {
    const parsed = parseAtpSearchQuery({
      page: "0",
      limit: "15",
      viewMode: "carousel",
      year: "abc",
    });
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.viewMode).toBe("grid");
    expect(parsed.year).toBeUndefined();
    expect(parseAtpSearchQuery({ year: "1949" }).year).toBeUndefined();
    expect(parseAtpSearchQuery({ year: "1995" }).year).toBe(1995);
  });
});

describe("serializeAtpSearchQuery", () => {
  it("omits defaults and round-trips", () => {
    expect(serializeAtpSearchQuery({})).toBe("");
    const query = {
      ...ATP_SEARCH_DEFAULTS,
      search: "zelda",
      year: 1998,
      page: 3,
      viewMode: "list" as const,
    };
    const serialized = serializeAtpSearchQuery(query);
    expect(serialized).toContain("search=zelda");
    expect(parseAtpSearchQuery(new URLSearchParams(serialized))).toEqual(
      query,
    );
  });
});

describe("BFF mapping", () => {
  it("maps search onto q and drops empties", () => {
    expect(
      toAtpBffParams({ ...ATP_SEARCH_DEFAULTS, search: "mario", page: 2 }),
    ).toEqual({ page: 2, limit: 20, q: "mario" });
  });

  it("builds a BFF search string honoring the real contract", () => {
    const params = new URLSearchParams(
      buildAtpBffSearchString({
        ...ATP_SEARCH_DEFAULTS,
        search: "chrono",
        platform: "SNES",
        year: 1995,
        family: "Nintendo",
      }),
    );
    expect(params.get("q")).toBe("chrono");
    expect(params.get("platform")).toBe("SNES");
    expect(params.get("year")).toBe("1995");
    expect(params.get("family")).toBe("Nintendo");
    expect(params.has("sort")).toBe(false);
  });

  it("detects submitted vs initial state", () => {
    expect(hasAtpSearch(ATP_SEARCH_DEFAULTS)).toBe(false);
    expect(
      hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, platform: "SNES" }),
    ).toBe(true);
    expect(hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, family: "PC" })).toBe(true);
  });
});

describe("fixed route context", () => {
  it("lets the route prevail over contradictory URL params", () => {
    const fromUrl = parseAtpSearchQuery(
      new URLSearchParams("platform=NES&search=mario"),
    );
    const locked = applyFixedContext(fromUrl, {
      platform: "PlayStation 5",
    });
    expect(locked.platform).toBe("PlayStation 5");
    expect(locked.search).toBe("mario");
    expect(toAtpBffParams(locked).platform).toBe("PlayStation 5");
  });

  it("keeps fixed values out of the query string", () => {
    const query = applyFixedContext(
      parseAtpSearchQuery(new URLSearchParams("search=mario")),
      { family: "Nintendo" },
    );
    const serialized = serializeWithFixedContext(query, {
      family: "Nintendo",
    });
    expect(serialized).not.toContain("family=");
    expect(serialized).toContain("search=mario");
    // …but the BFF still receives the family.
    expect(toAtpBffParams(query).family).toBe("Nintendo");
  });

  it("joins several fixed platforms into one BFF platform filter", () => {
    const query = applyFixedContext(ATP_SEARCH_DEFAULTS, {
      platform: ["PlayStation 5", "Xbox Series"].join(", "),
    });
    expect(toAtpBffParams(query).platform).toBe("PlayStation 5, Xbox Series");
  });
});
