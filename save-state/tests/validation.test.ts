import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import {
  parseBody,
  parseParams,
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";

const probeSchema = z.object({
  name: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
});

describe("parseBody", () => {
  it("returns validated data for valid input", () => {
    expect(parseBody(probeSchema, { name: "Zelda" })).toMatchObject({
      name: "Zelda",
      page: 1,
    });
  });

  it("throws VALIDATION_ERROR for invalid input", () => {
    try {
      parseBody(probeSchema, { name: "" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("VALIDATION_ERROR");
      expect((error as ApiError).status).toBe(400);
    }
  });
});

describe("parseParams", () => {
  it("throws VALIDATION_ERROR for invalid params", () => {
    const schema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/) });
    expect(() => parseParams(schema, { id: "nope" })).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });
});

describe("parseQuery", () => {
  it("throws INVALID_QUERY for invalid query input", () => {
    try {
      parseQuery(probeSchema, { name: "Zelda", page: "NaN-ish" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("INVALID_QUERY");
      expect((error as ApiError).status).toBe(400);
    }
  });
});

describe("searchParamsToObject", () => {
  it("converts URLSearchParams to a plain object for Zod parsing", () => {
    const params = new URLSearchParams("name=Zelda&page=2");
    const parsed = parseQuery(probeSchema, searchParamsToObject(params));
    expect(parsed).toMatchObject({ name: "Zelda", page: 2 });
  });
});
