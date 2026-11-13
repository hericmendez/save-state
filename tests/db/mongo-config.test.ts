import { describe, expect, it } from "vitest";
import {
  MONGOOSE_CONNECTION_OPTIONS,
  resolveMongoDbName,
} from "@/db/mongo-config";

describe("MongoDB runtime configuration", () => {
  it("uses the development default only outside Vercel", () => {
    expect(resolveMongoDbName({})).toBe("save-state");
    expect(resolveMongoDbName({ VERCEL_ENV: "development" })).toBe("save-state");
  });

  it("prefers CLI override, then MONGODB_DB_NAME, over the URI path", () => {
    expect(resolveMongoDbName({ MONGODB_DB_NAME: "save-state-preview" })).toBe(
      "save-state-preview",
    );
    expect(
      resolveMongoDbName(
        { MONGODB_DB_NAME: "save-state-preview" },
        "save-state-cli",
      ),
    ).toBe("save-state-cli");
    // Mongoose receives this as `dbName`, which its official docs specify
    // overrides the database path in the connection string.
  });

  it.each([
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "production" },
  ])("requires an explicit DB name in deployment context %#", (context) => {
    expect(() => resolveMongoDbName(context)).toThrow(/MONGODB_DB_NAME is required/);
  });

  it("rejects empty, overlong, malformed, and non-ASCII names", () => {
    for (const name of ["", "   ", "bad/name", "has.dot", "db?x", "é", "a".repeat(64)]) {
      expect(() => resolveMongoDbName({ MONGODB_DB_NAME: name })).toThrow(
        /MONGODB_DB_NAME must (not be empty|be 1-63 ASCII)/,
      );
    }
  });

  it("sets a small serverless pool and bounded selection/idle timeouts", () => {
    expect(MONGOOSE_CONNECTION_OPTIONS).toEqual({
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxIdleTimeMS: 30_000,
    });
  });
});
