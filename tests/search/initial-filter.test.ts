/**
 * Alphabetical initial filter (A–Z, 0–9, #): pure query contracts +
 * UI/server wiring. The filter is a free URL param (`initial`, Todos =
 * absent) applied server-side by the IGDB provider; the ATP provider
 * rejects it explicitly. The UI select resets the page and preserves the
 * other filters.
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  INITIAL_DIGITS,
  INITIAL_LETTERS,
  INITIAL_VARIANTS,
  buildInitialClause,
  classifyInitial,
  hashExcludedForms,
  initialForms,
  isCatalogInitial,
  parseAtpSearchQuery,
  parseInitialParam,
  serializeAtpSearchQuery,
  type CatalogInitial,
  type InitialLetter,
} from "@/features/atp/atp-search-query";

describe("initial buckets (A–Z, 0–9, #)", () => {
  it("accepts the 26 letters plus 0-9 and #", () => {
    expect(INITIAL_LETTERS).toHaveLength(26);
    expect(INITIAL_DIGITS).toHaveLength(10);
    const valid: string[] = [...INITIAL_LETTERS, "0-9", "#"];
    expect(valid).toHaveLength(28);
    for (const bucket of valid) {
      expect(isCatalogInitial(bucket)).toBe(true);
    }
  });

  it("rejects lowercase, multi-char and unknown buckets", () => {
    for (const raw of ["m", "AB", "1", "!", "", "todos", "00-99"]) {
      expect(isCatalogInitial(raw)).toBe(false);
    }
  });

  it("normalizes raw URL values (Todos = absent, lowercase upcased)", () => {
    expect(parseInitialParam("")).toBe("");
    expect(parseInitialParam("todos")).toBe("");
    expect(parseInitialParam("m")).toBe("M");
    expect(parseInitialParam("M")).toBe("M");
    expect(parseInitialParam("0-9")).toBe("0-9");
    expect(parseInitialParam("0–9")).toBe("0-9");
    expect(parseInitialParam("#")).toBe("#");
  });

  it("falls back to Todos for invalid raw values instead of throwing", () => {
    for (const raw of ["!", "AB", "12", "a1", "todos!"]) {
      expect(parseInitialParam(raw)).toBe("");
    }
  });
});

describe("classifyInitial mirrors the server-side buckets", () => {
  it("classifies plain titles case-insensitively with leading trim", () => {
    expect(classifyInitial("Mario")).toBe("M");
    expect(classifyInitial("mario")).toBe("M");
    expect(classifyInitial("  Zelda")).toBe("Z");
  });

  it("classifies leading digits as 0-9", () => {
    expect(classifyInitial("1942")).toBe("0-9");
    expect(classifyInitial("7th Guest")).toBe("0-9");
  });

  it("classifies Latin-1 variants under their base letter", () => {
    expect(classifyInitial("Éon")).toBe("E");
    expect(classifyInitial("Ñandú")).toBe("N");
    expect(classifyInitial("Çelik")).toBe("C");
    for (const letter of INITIAL_LETTERS) {
      for (const variant of INITIAL_VARIANTS[letter]) {
        expect(classifyInitial(variant)).toBe(letter);
      }
    }
  });

  it("returns null for empty titles and # for the rest", () => {
    expect(classifyInitial("")).toBeNull();
    expect(classifyInitial("   ")).toBeNull();
    expect(classifyInitial("!Remix")).toBe("#");
  });
});

describe("IGDB where-clause builder", () => {
  it("builds a single-letter prefix clause", () => {
    expect(buildInitialClause("M")).toBe('(name ~ "M"*)');
  });

  it("builds a ten-way digit clause", () => {
    const clause = buildInitialClause("0-9");
    expect(clause.startsWith("(")).toBe(true);
    expect(clause).toContain('name ~ "0"*');
    expect(clause).toContain('name ~ "9"*');
    expect(clause.split(" | ")).toHaveLength(10);
  });

  it("builds a negated clause for # (no positive terms)", () => {
    const clause = buildInitialClause("#");
    expect(clause).toContain('name !~ "A"*');
    expect(clause).toContain(" & ");
    expect(clause).not.toContain(" | ");
  });

  it("covers every letter form exactly once in the # exclusion", () => {
    const forms = hashExcludedForms();
    expect(forms).toContain("M");
    expect(forms).toContain("9");
    const letters = INITIAL_LETTERS as readonly string[];
    for (const letter of letters) {
      for (const form of initialForms(letter as InitialLetter)) {
        expect(forms).toContain(form);
      }
    }
  });

  it("expands every letter to its base plus diacritic variants", () => {
    expect(initialForms("E")).toEqual(["E", "È", "É", "Ê", "Ë"]);
    expect(initialForms("B")).toEqual(["B"]);
  });
});

describe("initial in the URL query contract", () => {
  it("parses the initial param and keeps the Todos default", () => {
    expect(parseAtpSearchQuery(undefined).initial).toBe("");
    expect(parseAtpSearchQuery(new URLSearchParams("initial=m")).initial).toBe("M");
    expect(parseAtpSearchQuery(new URLSearchParams("initial=%23")).initial).toBe("#");
    expect(parseAtpSearchQuery({ initial: "bogus" }).initial).toBe("");
  });

  it("serializes only when set (Todos stays absent) and round-trips", () => {
    expect(serializeAtpSearchQuery({ initial: "" })).not.toContain("initial=");
    const qs = serializeAtpSearchQuery({ initial: "M" as CatalogInitial });
    expect(qs).toContain("initial=M");
    expect(parseAtpSearchQuery(new URLSearchParams(qs)).initial).toBe("M");
  });

  it("coexists with the other filters in one query string", () => {
    const qs = serializeAtpSearchQuery({
      search: "mario",
      platform: "Nintendo Switch",
      initial: "M" as CatalogInitial,
      page: 3,
    });
    const parsed = parseAtpSearchQuery(new URLSearchParams(qs));
    expect(parsed.initial).toBe("M");
    expect(parsed.search).toBe("mario");
    expect(parsed.platform).toBe("Nintendo Switch");
    expect(parsed.page).toBe(3);
  });
});

describe("initial filter UI wiring (source contract)", () => {
  const card = readFileSync(
    "features/atp/catalog-search.tsx",
    "utf8",
  );

  it("renders Todas, 0–9, # and A–Z options in the native select", () => {
    expect(card).toContain('id="catalog-initial"');
    expect(card).toContain("Todas as iniciais");
    expect(card).toContain('value="0-9"');
    expect(card).toContain('value="#"');
    expect(card).toContain("INITIAL_LETTERS.map((letter)");
  });

  it("resets the page on initial change while preserving other filters", () => {
    // handleInitialChange patches only `initial`; commitQuery defaults to
    // resetting the page, and the spread keeps the remaining filters.
    expect(card).toContain("function handleInitialChange(initial: CatalogInitial | \"\")");
    expect(card).toContain("commitQuery({ initial })");
    expect(card).toContain("resetPage = true");
    expect(card).toContain("page: resetPage ? 1");
  });

  it("clears only the initial filter on Todos", () => {
    expect(card).toContain('initial: ""');
    // Clearing must not wipe the other filters (patch semantics).
    expect(card).not.toContain("commitQuery({ search:");
  });
});

describe("initial filter server wiring (source contract)", () => {
  it("applies the clause server-side in the IGDB provider", () => {
    const provider = readFileSync(
      "server/search/igdb-provider.ts",
      "utf8",
    );
    expect(provider).toContain("buildInitialClause");
    expect(provider).toContain("params.initial");
  });

  it("rejects the initial explicitly on the ATP provider", () => {
    const provider = readFileSync(
      "server/search/atp-provider.ts",
      "utf8",
    );
    expect(provider).toContain("initial");
    expect(provider).toContain("not supported by the ATP provider");
  });
});
