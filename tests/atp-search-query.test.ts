/**
 * Etapa 2 — Busca Geral URL state over the BFF contract
 * (q/search, platform, genre, yearMin/yearMax, developer, publisher,
 * sortBy/order, page, limit, viewMode).
 *
 * Family is route-locked context (family detail pages), never a free URL
 * param. Sort "relevance" is the provider default, represented by an
 * absent sortBy. The legacy single `year` param maps to [year, year].
 */

import { describe, expect, it } from "vitest";
import {
  ATP_SEARCH_DEFAULTS,
  applyFixedContext,
  buildAtpBffSearchString,
  buildInitialClause,
  classifyInitial,
  defaultOrderForSort,
  hasAtpSearch,
  INITIAL_LETTERS,
  INITIAL_VARIANTS,
  isCatalogInitial,
  parseAtpSearchQuery,
  parseInitialParam,
  parseYearBound,
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
          "search=chrono&platform=SNES&genre=RPG&yearMin=2000&yearMax=2010&developer=Square&publisher=Nintendo&sortBy=title&order=desc&page=2&limit=50&viewMode=list",
        ),
      ),
    ).toEqual({
      search: "chrono",
      platform: "SNES",
      genre: "RPG",
      yearMin: 2000,
      yearMax: 2010,
      developer: "Square",
      publisher: "Nintendo",
      family: "",
      initial: "",
      sortBy: "title",
      page: 2,
      limit: 50,
      viewMode: "list",
      order: "desc",
    });
  });

  it("maps the legacy single year onto both range bounds", () => {
    expect(parseAtpSearchQuery({ year: "1995" })).toMatchObject({
      yearMin: 1995,
      yearMax: 1995,
    });
    // Explicit bounds win over the legacy alias.
    expect(
      parseAtpSearchQuery({ year: "1995", yearMin: "2000", yearMax: "2010" }),
    ).toMatchObject({ yearMin: 2000, yearMax: 2010 });
  });

  it("treats relevance as the absent (default) sort", () => {
    expect(parseAtpSearchQuery({ sortBy: "relevance" }).sortBy).toBeUndefined();
    expect(parseAtpSearchQuery({ sortBy: "bogus" }).sortBy).toBeUndefined();
    expect(parseAtpSearchQuery({ sortBy: "year" }).sortBy).toBe("year");
  });

  it("ignores a free family URL param (route-locked only)", () => {
    expect(
      parseAtpSearchQuery(new URLSearchParams("family=Nintendo&search=mario")),
    ).toMatchObject({ family: "", search: "mario" });
  });

  it("falls back predictably for invalid values", () => {
    const parsed = parseAtpSearchQuery({
      page: "0",
      limit: "15",
      viewMode: "carousel",
      yearMin: "abc",
      order: "sideways",
    });
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.viewMode).toBe("grid");
    expect(parsed.yearMin).toBeUndefined();
    expect(parsed.order).toBe("asc");
    expect(parseAtpSearchQuery({ yearMin: "1949" }).yearMin).toBeUndefined();
    expect(parseAtpSearchQuery({ yearMax: "1995" }).yearMax).toBe(1995);
  });
});

describe("defaultOrderForSort", () => {
  it("applies per-option defaults without cross-contamination", () => {
    expect(defaultOrderForSort(undefined)).toBe("asc");
    expect(defaultOrderForSort("relevance")).toBe("asc");
    expect(defaultOrderForSort("title")).toBe("asc");
    expect(defaultOrderForSort("year")).toBe("desc");
  });
});

describe("serializeAtpSearchQuery", () => {
  it("omits defaults and round-trips", () => {
    expect(serializeAtpSearchQuery({})).toBe("");
    const query = {
      ...ATP_SEARCH_DEFAULTS,
      search: "zelda",
      yearMin: 1998,
      yearMax: 1998,
      page: 3,
      viewMode: "list" as const,
    };
    const serialized = serializeAtpSearchQuery(query);
    expect(serialized).toContain("search=zelda");
    expect(serialized).toContain("yearMin=1998");
    expect(parseAtpSearchQuery(new URLSearchParams(serialized))).toEqual(
      query,
    );
  });

  it("round-trips an explicit title/year sort with direction", () => {
    for (const sortBy of ["title", "year"] as const) {
      const query = {
        ...ATP_SEARCH_DEFAULTS,
        search: "mario",
        sortBy,
        order: "desc" as const,
      };
      const roundTripped = parseAtpSearchQuery(
        new URLSearchParams(serializeAtpSearchQuery(query)),
      );
      expect(roundTripped.sortBy).toBe(sortBy);
      expect(roundTripped.order).toBe("desc");
    }
  });

  it("never serializes family or a direction without an explicit sort", () => {
    const serialized = serializeAtpSearchQuery({
      ...ATP_SEARCH_DEFAULTS,
      family: "Nintendo",
      order: "desc",
    });
    expect(serialized).not.toContain("family=");
    expect(serialized).not.toContain("order=");
  });

  it("persists sort across pagination", () => {
    const page2 = parseAtpSearchQuery(
      new URLSearchParams(
        serializeAtpSearchQuery({
          ...ATP_SEARCH_DEFAULTS,
          genre: "RPG",
          sortBy: "year",
          order: "desc",
          page: 3,
        }),
      ),
    );
    expect(page2).toMatchObject({ sortBy: "year", order: "desc", page: 3 });
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
        yearMin: 1990,
        yearMax: 1999,
        developer: "Square",
        sortBy: "title",
        order: "asc",
      }),
    );
    expect(params.get("q")).toBe("chrono");
    expect(params.get("platform")).toBe("SNES");
    expect(params.get("yearMin")).toBe("1990");
    expect(params.get("yearMax")).toBe("1999");
    expect(params.get("developer")).toBe("Square");
    expect(params.get("sortBy")).toBe("title");
    expect(params.get("order")).toBe("asc");
  });

  it("detects submitted vs initial state (title optional, sort alone never fetches)", () => {
    expect(hasAtpSearch(ATP_SEARCH_DEFAULTS)).toBe(false);
    expect(
      hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, platform: "SNES" }),
    ).toBe(true);
    // Filters alone are a valid search (thematic-URL ready).
    expect(hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, yearMin: 2000 })).toBe(true);
    expect(
      hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, genre: "RPG" }),
    ).toBe(true);
    // Sorting alone orders nothing: no fetch.
    expect(
      hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, sortBy: "title" }),
    ).toBe(false);
    // Route-locked family context counts as submitted.
    expect(hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, family: "Nintendo" })).toBe(
      true,
    );
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

  it("injects the locked family into the BFF but keeps it out of the URL", () => {
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

describe("parseYearBound", () => {
  it("accepts empty/in-range years and rejects the rest", () => {
    expect(parseYearBound("")).toBeUndefined();
    expect(parseYearBound("  ")).toBeUndefined();
    expect(parseYearBound("2000")).toBe(2000);
    expect(parseYearBound("abc")).toBeUndefined();
    expect(parseYearBound("99")).toBeUndefined();
    expect(parseYearBound("1949")).toBeUndefined();
  });
});

describe("índice alfanumérico — normalização", () => {
  it("classifies letters, digits, symbols and leading spaces", () => {
    expect(classifyInitial("Mario")).toBe("M");
    expect(classifyInitial("  zelda")).toBe("Z");
    expect(classifyInitial("007")).toBe("0-9");
    expect(classifyInitial("  2Fast")).toBe("0-9");
    expect(classifyInitial("^_^ bem-vindo")).toBe("#");
    expect(classifyInitial("")).toBeNull();
    expect(classifyInitial("   ")).toBeNull();
  });

  it("keeps articles (uses the real start of the title)", () => {
    expect(classifyInitial("The Legend of Zelda")).toBe("T");
    expect(classifyInitial("A Link to the Past")).toBe("A");
  });

  it("maps accented Latin-1 letters to the base letter", () => {
    expect(classifyInitial("Águia")).toBe("A");
    expect(classifyInitial("éclair")).toBe("E");
    expect(classifyInitial("Ñandú")).toBe("N");
    expect(classifyInitial("Çelik")).toBe("C");
    expect(classifyInitial("Über")).toBe("U");
  });

  it("sends non-Latin scripts and ligatures to #", () => {
    expect(classifyInitial("日本語タイトル")).toBe("#");
    expect(classifyInitial("Привет")).toBe("#");
    expect(classifyInitial("Æon")).toBe("#");
    expect(classifyInitial("ßpiel")).toBe("#");
  });

  it("keeps every table variant consistent with classifyInitial", () => {
    for (const letter of INITIAL_LETTERS) {
      for (const variant of INITIAL_VARIANTS[letter]) {
        expect(classifyInitial(variant)).toBe(letter);
        expect(classifyInitial(variant.toLowerCase())).toBe(letter);
      }
    }
  });

  it("parses raw URL values into valid buckets", () => {
    expect(parseInitialParam("")).toBe("");
    expect(parseInitialParam("todos")).toBe("");
    expect(parseInitialParam("m")).toBe("M");
    expect(parseInitialParam("Z")).toBe("Z");
    expect(parseInitialParam("0-9")).toBe("0-9");
    expect(parseInitialParam("#")).toBe("#");
    expect(parseInitialParam("AB")).toBe("");
    expect(parseInitialParam("bogus")).toBe("");
    expect(isCatalogInitial("M")).toBe(true);
    expect(isCatalogInitial("0-9")).toBe(true);
    expect(isCatalogInitial("#")).toBe(true);
    expect(isCatalogInitial("todos")).toBe(false);
  });
});

describe("índice alfanumérico — URL e BFF", () => {
  it("parses and round-trips the initial param", () => {
    expect(
      parseAtpSearchQuery(new URLSearchParams("initial=m")).initial,
    ).toBe("M");
    expect(
      parseAtpSearchQuery(new URLSearchParams("initial=bogus")).initial,
    ).toBe("");
    expect(
      parseAtpSearchQuery(new URLSearchParams()).initial,
    ).toBe("");
    const query = { ...ATP_SEARCH_DEFAULTS, initial: "M" as const };
    expect(serializeAtpSearchQuery(query)).toContain("initial=M");
    expect(serializeAtpSearchQuery(ATP_SEARCH_DEFAULTS)).not.toContain(
      "initial",
    );
  });

  it("counts initial-only as a submitted search", () => {
    expect(hasAtpSearch({ ...ATP_SEARCH_DEFAULTS, initial: "M" })).toBe(true);
    expect(hasAtpSearch(ATP_SEARCH_DEFAULTS)).toBe(false);
  });

  it("carries initial through the BFF params", () => {
    const query = { ...ATP_SEARCH_DEFAULTS, initial: "#" as const };
    expect(toAtpBffParams(query).initial).toBe("#");
    expect(buildAtpBffSearchString(query)).toContain("initial=%23");
    expect(buildAtpBffSearchString(ATP_SEARCH_DEFAULTS)).not.toContain(
      "initial",
    );
  });
});

describe("índice alfanumérico — cláusulas Apicalypse", () => {
  it("builds a single-letter prefix clause", () => {
    expect(buildInitialClause("M")).toBe('(name ~ "M"*)');
  });

  it("expands accented variants for the selected letter", () => {
    const clause = buildInitialClause("E");
    expect(clause).toContain('name ~ "E"*');
    expect(clause).toContain('name ~ "É"*');
    expect(clause).toContain('name ~ "È"*');
    expect(clause.startsWith("(")).toBe(true);
  });

  it("builds a 10-way OR for digits", () => {
    const clause = buildInitialClause("0-9");
    for (let digit = 0; digit <= 9; digit++) {
      expect(clause).toContain(`name ~ "${digit}"*`);
    }
    expect(clause.startsWith("(")).toBe(true);
  });

  it("negates every alphanumeric form for #", () => {
    const clause = buildInitialClause("#");
    expect(clause).toContain('name !~ "A"*');
    expect(clause).toContain('name !~ "Z"*');
    expect(clause).toContain('name !~ "0"*');
    expect(clause).toContain('name !~ "9"*');
    expect(clause).toContain('name !~ "É"*');
    expect(clause).not.toContain(" | ");
  });
});
