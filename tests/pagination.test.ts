import { describe, expect, it } from "vitest";
import {
  buildPaginatedResponse,
  pageOffset,
  paginationQuerySchema,
} from "@/server/shared/pagination";
import { parseQuery } from "@/server/shared/validation";

describe("paginationQuerySchema", () => {
  it("applies page/limit defaults", () => {
    expect(parseQuery(paginationQuerySchema, {})).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it("coerces string values from query strings", () => {
    expect(parseQuery(paginationQuerySchema, { page: "3", limit: "5" })).toEqual(
      { page: 3, limit: 5 },
    );
  });

  it("rejects pages below 1 and limits above the maximum", () => {
    expect(() =>
      parseQuery(paginationQuerySchema, { page: 0 }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_QUERY" }));
    expect(() =>
      parseQuery(paginationQuerySchema, { limit: 101 }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_QUERY" }));
  });
});

describe("buildPaginatedResponse", () => {
  it("builds the { data, pagination } envelope", () => {
    const response = buildPaginatedResponse(["a", "b"], 45, {
      page: 2,
      limit: 20,
    });
    expect(response).toEqual({
      data: ["a", "b"],
      pagination: {
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
  });

  it("reports zero pages for an empty collection", () => {
    const response = buildPaginatedResponse([], 0, { page: 1, limit: 20 });
    expect(response.pagination.totalPages).toBe(0);
    expect(response.pagination.hasNextPage).toBe(false);
  });
});

describe("pageOffset", () => {
  it("derives skip from the current page", () => {
    expect(pageOffset({ page: 1, limit: 20 })).toBe(0);
    expect(pageOffset({ page: 3, limit: 20 })).toBe(40);
  });
});
