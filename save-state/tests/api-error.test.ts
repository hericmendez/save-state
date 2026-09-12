import { describe, expect, it } from "vitest";
import { ApiError, toErrorResponse } from "@/lib/api-error";

describe("ApiError", () => {
  it("serializes to the { error: { code, message } } contract", () => {
    const error = new ApiError("VALIDATION_ERROR", "Name is required");
    expect(error.toBody()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Name is required" },
    });
  });

  it("maps codes to their default HTTP status", () => {
    expect(new ApiError("UNAUTHENTICATED", "Nope").status).toBe(401);
    expect(new ApiError("NOT_FOUND", "Nope").status).toBe(404);
    expect(new ApiError("ROUTE_NOT_FOUND", "Nope").status).toBe(404);
    expect(new ApiError("VALIDATION_ERROR", "Nope").status).toBe(400);
    expect(new ApiError("INTERNAL_ERROR", "Nope").status).toBe(500);
  });

  it("allows an explicit status override", () => {
    const error = new ApiError("NOT_FOUND", "Gone", 410);
    expect(error.status).toBe(410);
  });
});

describe("toErrorResponse", () => {
  it("passes ApiError through with its code, message, and status", async () => {
    const response = toErrorResponse(new ApiError("NOT_FOUND", "Missing"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Missing" },
    });
  });

  it("converts unknown failures to INTERNAL_ERROR without leaking internals", async () => {
    const response = toErrorResponse(new Error("mongodb://secret/internal"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
