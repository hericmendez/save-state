import { afterEach, describe, expect, it } from "vitest";
import { __resetServerEnvCache, loadServerEnv } from "@/lib/env";

const VALID = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:3000",
} as const;

afterEach(() => {
  __resetServerEnvCache();
});

describe("loadServerEnv", () => {
  it("accepts a complete valid environment", () => {
    expect(loadServerEnv({ ...VALID })).toMatchObject({
      MONGODB_URI: VALID.MONGODB_URI,
      APP_URL: VALID.APP_URL,
    });
  });

  it("rejects a missing MONGODB_URI", () => {
    expect(() => loadServerEnv({ ...VALID, MONGODB_URI: undefined })).toThrow(
      /MONGODB_URI/,
    );
  });

  it("rejects a short JWT_SECRET", () => {
    expect(() => loadServerEnv({ ...VALID, JWT_SECRET: "short" })).toThrow(
      /JWT_SECRET/,
    );
  });

  it("rejects a missing APP_URL", () => {
    expect(() => loadServerEnv({ ...VALID, APP_URL: undefined })).toThrow(
      /APP_URL/,
    );
  });

  it("keeps ATP_BASE_URL optional until Phase 9", () => {
    const env = loadServerEnv({ ...VALID, ATP_BASE_URL: undefined });
    expect(env.ATP_BASE_URL).toBeUndefined();
  });
});
