import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import {
  created,
  handleRoute,
  noContent,
  ok,
} from "@/server/shared/route-handler";

describe("response helpers", () => {
  it("ok wraps data with status 200 by default", async () => {
    const response = ok({ hello: "world" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { hello: "world" } });
  });

  it("created responds with status 201", async () => {
    const response = created({ id: "1" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { id: "1" } });
  });

  it("noContent responds with an empty 204", async () => {
    const response = noContent();
    expect(response.status).toBe(204);
    expect(response).toBeInstanceOf(NextResponse);
  });
});

describe("handleRoute", () => {
  it("passes successful handler responses through", async () => {
    const response = await handleRoute(() => ok({ fine: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { fine: true } });
  });

  it("translates ApiError to the contract without logging", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const response = await handleRoute(() => {
      throw new ApiError("NOT_FOUND", "Missing");
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Missing" },
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("sanitizes unknown failures and logs them server-side", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const response = await handleRoute(() => {
      throw new Error("mongodb://admin:s3cret@localhost/db");
    });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(JSON.stringify(body)).not.toContain("s3cret");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
