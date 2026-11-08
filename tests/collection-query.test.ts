import { describe, expect, it } from "vitest";
import {
  COLLECTION_DEFAULTS,
  COLLECTION_PAGE_SIZES,
  parseCollectionOrder,
  parseCollectionQuery,
  parseViewMode,
  serializeCollectionQuery,
} from "@/features/collection/collection-query";

describe("parseCollectionQuery", () => {
  it("returns defaults for empty input", () => {
    expect(parseCollectionQuery(undefined)).toEqual(COLLECTION_DEFAULTS);
    expect(parseCollectionQuery(new URLSearchParams())).toEqual(
      COLLECTION_DEFAULTS,
    );
    expect(parseCollectionQuery({})).toEqual(COLLECTION_DEFAULTS);
  });

  it("parses a full valid query string", () => {
    const parsed = parseCollectionQuery(
      new URLSearchParams(
        "search=zelda&platform=Switch&family=Nintendo&yearFrom=2017&yearTo=2023" +
          "&status=playing&orderBy=title&order=desc&page=2&limit=50&viewMode=list",
      ),
    );
    expect(parsed).toEqual({
      search: "zelda",
      platform: "Switch",
      family: "Nintendo",
      yearFrom: 2017,
      yearTo: 2023,
      status: "playing",
      orderBy: "title",
      order: "desc",
      page: 2,
      limit: 50,
      viewMode: "list",
    });
  });

  it("accepts plain record input and trims strings", () => {
    const parsed = parseCollectionQuery({
      search: "  mario  ",
      page: "3",
      viewMode: "list",
    });
    expect(parsed.search).toBe("mario");
    expect(parsed.page).toBe(3);
    expect(parsed.viewMode).toBe("list");
  });

  it("falls back to page 1 for invalid pages", () => {
    for (const page of ["0", "-2", "abc", "2.5", ""]) {
      expect(
        parseCollectionQuery({ page }).page,
        `page=${JSON.stringify(page)}`,
      ).toBe(1);
    }
  });

  it("falls back to the default limit for sizes outside 10/20/30/50/100", () => {
    for (const limit of ["15", "0", "200", "abc", ""]) {
      expect(
        parseCollectionQuery({ limit }).limit,
        `limit=${JSON.stringify(limit)}`,
      ).toBe(COLLECTION_DEFAULTS.limit);
    }
    expect(parseCollectionQuery({ limit: "100" }).limit).toBe(100);
  });

  it("falls back to asc/grid for invalid order/viewMode", () => {
    expect(parseCollectionQuery({ order: "sideways" }).order).toBe("asc");
    expect(parseCollectionQuery({ viewMode: "carousel" }).viewMode).toBe(
      "grid",
    );
    expect(parseViewMode("list")).toBe("list");
    expect(parseViewMode("grid")).toBe("grid");
    expect(parseViewMode(undefined)).toBe("grid");
    expect(parseCollectionOrder("desc")).toBe("desc");
    expect(parseCollectionOrder(undefined)).toBe("asc");
  });

  it("drops invalid years instead of guessing", () => {
    expect(parseCollectionQuery({ yearFrom: "abc" }).yearFrom).toBeUndefined();
    expect(parseCollectionQuery({ yearFrom: "99" }).yearFrom).toBeUndefined();
    expect(parseCollectionQuery({ yearFrom: "" }).yearFrom).toBeUndefined();
    expect(parseCollectionQuery({ yearTo: "20.5" }).yearTo).toBeUndefined();
    expect(parseCollectionQuery({ yearFrom: "1998" }).yearFrom).toBe(1998);
  });
});

describe("serializeCollectionQuery", () => {
  it("omits defaults and empty values", () => {
    expect(serializeCollectionQuery({})).toBe("");
    expect(serializeCollectionQuery({ ...COLLECTION_DEFAULTS })).toBe("");
  });

  it("emits only meaningful values and round-trips through the parser", () => {
    const query = {
      ...COLLECTION_DEFAULTS,
      search: "zelda",
      yearFrom: 2017,
      page: 2,
      limit: 50,
      viewMode: "list" as const,
    };
    const serialized = serializeCollectionQuery(query);
    expect(serialized).toContain("search=zelda");
    expect(serialized).toContain("page=2");
    expect(parseCollectionQuery(new URLSearchParams(serialized))).toEqual(
      query,
    );
  });
});

describe("COLLECTION_PAGE_SIZES", () => {
  it("covers 10/20/30/50/100", () => {
    expect([...COLLECTION_PAGE_SIZES]).toEqual([10, 20, 30, 50, 100]);
  });
});
