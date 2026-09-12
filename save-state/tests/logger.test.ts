import { describe, expect, it, vi } from "vitest";
import { logger } from "@/server/shared/logger";

function lastLoggedPayload(errorSpy: ReturnType<typeof vi.spyOn>): unknown {
  const call = errorSpy.mock.calls.at(-1);
  expect(call).toBeDefined();
  return JSON.parse(call![0] as string);
}

describe("logger", () => {
  it("redacts sensitive object keys", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("login failed", {
      userId: "u1",
      token: "jwt-value",
      passwordHash: "hash-value",
    });
    const payload = lastLoggedPayload(errorSpy) as {
      details: Record<string, unknown>;
    };
    expect(payload.details.userId).toBe("u1");
    expect(payload.details.token).toBe("***");
    expect(payload.details.passwordHash).toBe("***");
    errorSpy.mockRestore();
  });

  it("redacts credentials embedded in connection strings and headers", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("db failure", {
      uri: "mongodb://admin:s3cret@localhost:27017/db",
      auth: "Bearer abc.def.ghi",
    });
    const payload = lastLoggedPayload(errorSpy) as {
      details: Record<string, unknown>;
    };
    expect(payload.details.uri).toBe("mongodb://***@localhost:27017/db");
    expect(payload.details.auth).toBe("Bearer ***");
    errorSpy.mockRestore();
  });

  it("keeps non-sensitive values intact", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("route failed", { code: "NOT_FOUND", count: 3 });
    const payload = lastLoggedPayload(errorSpy) as {
      details: Record<string, unknown>;
    };
    expect(payload.details).toEqual({ code: "NOT_FOUND", count: 3 });
    errorSpy.mockRestore();
  });
});
