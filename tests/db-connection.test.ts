import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetConnectionCache,
  connectDatabase,
} from "@/db/connection";
import { __resetServerEnvCache } from "@/lib/env";
import { logger } from "@/server/shared/logger";

const VALID_ENV = {
  MONGODB_URI: "mongodb://localhost:27017/save-state",
  JWT_SECRET: "b".repeat(32),
  APP_URL: "http://localhost:3000",
};

function connectedInstance(models: Record<string, unknown> = {}) {
  return { models, connection: { readyState: 1 } } as unknown as typeof mongoose;
}

afterEach(() => {
  __resetConnectionCache();
  __resetServerEnvCache();
  vi.restoreAllMocks();
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB_NAME;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.JWT_SECRET;
  delete process.env.APP_URL;
});

describe("connectDatabase", () => {
  it("opens a single connection across sequential calls", async () => {
    Object.assign(process.env, VALID_ENV);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(connectedInstance());

    const first = await connectDatabase();
    const second = await connectDatabase();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(connect).toHaveBeenCalledWith(VALID_ENV.MONGODB_URI, {
      dbName: "save-state",
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxIdleTimeMS: 30_000,
    });
  });

  it("uses an explicit isolated database name when configured", async () => {
    Object.assign(process.env, VALID_ENV, {
      MONGODB_DB_NAME: "save-state-index-test",
    });
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(connectedInstance());

    await connectDatabase();

    expect(connect).toHaveBeenCalledWith(VALID_ENV.MONGODB_URI, {
      dbName: "save-state-index-test",
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxIdleTimeMS: 30_000,
    });
  });

  it("reuses the in-flight promise under concurrency", async () => {
    Object.assign(process.env, VALID_ENV);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(connectedInstance());

    const [first, second, third] = await Promise.all([
      connectDatabase(),
      connectDatabase(),
      connectDatabase(),
    ]);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("fails closed without a configured MONGODB_URI", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    Object.assign(process.env, {
      JWT_SECRET: "c".repeat(32),
      APP_URL: "http://localhost:3000",
    });

    await expect(connectDatabase()).rejects.toThrow(/MONGODB_URI/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("requires an explicit database in Vercel Preview before connecting", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    Object.assign(process.env, VALID_ENV, { VERCEL_ENV: "preview" });

    await expect(connectDatabase()).rejects.toThrow(/MONGODB_DB_NAME is required/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects invalid database names before connecting", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    Object.assign(process.env, VALID_ENV, { MONGODB_DB_NAME: "bad/name" });

    await expect(connectDatabase()).rejects.toThrow(/1-63 ASCII/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a different database while a connection is cached", async () => {
    Object.assign(process.env, VALID_ENV, { MONGODB_DB_NAME: "save-state-preview" });
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(connectedInstance());
    await connectDatabase();

    process.env.MONGODB_DB_NAME = "save-state-production";
    __resetServerEnvCache();
    await expect(connectDatabase()).rejects.toThrow(/different URI\/database/);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a cached connection after Mongoose reports disconnection", async () => {
    Object.assign(process.env, VALID_ENV);
    const instance = connectedInstance();
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValueOnce(instance)
      .mockResolvedValue(connectedInstance());
    await connectDatabase();

    (instance as unknown as { connection: { readyState: number } }).connection.readyState = 0;
    await connectDatabase();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("retries a failed initial connection and redacts connection details", async () => {
    Object.assign(process.env, VALID_ENV);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockRejectedValueOnce(new Error(`bad credentials ${VALID_ENV.MONGODB_URI}`))
      .mockResolvedValue(connectedInstance());

    let failure: unknown;
    try {
      await connectDatabase();
    } catch (reason) {
      failure = reason;
    }
    expect(failure).toBeInstanceOf(Error);
    const error = failure as Error;
    expect(error.message).toMatch(/credentials redacted/);
    expect(error.message).not.toContain(VALID_ENV.MONGODB_URI);
    await expect(connectDatabase()).resolves.toBeDefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("ensures declared indexes before serving operations", async () => {
    Object.assign(process.env, VALID_ENV);
    const ensureIndexes = vi.fn().mockResolvedValue(undefined);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(connectedInstance({ Widget: { ensureIndexes } }));

    await connectDatabase();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(ensureIndexes).toHaveBeenCalledTimes(1);
  });

  it("keeps a cold readiness connection read-only outside production too", async () => {
    Object.assign(process.env, VALID_ENV, { NODE_ENV: "development" });
    const ensureIndexes = vi.fn();
    const listIndexes = vi.fn(async () => [{ key: { email: 1 }, unique: true }]);
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue(connectedInstance({
      Widget: {
        modelName: "Widget",
        schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
        collection: { listIndexes: () => ({ toArray: listIndexes }) },
        ensureIndexes,
      },
    }));

    await connectDatabase({ readOnlyIndexes: true });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(listIndexes).toHaveBeenCalledTimes(1);
    expect(ensureIndexes).not.toHaveBeenCalled();
  });

  it("refuses the connection when index ensure fails, without poisoning the cache", async () => {
    Object.assign(process.env, VALID_ENV);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const ensureIndexes = vi
      .fn()
      .mockRejectedValueOnce(new Error("index build failed"))
      .mockResolvedValue(undefined);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(connectedInstance({ Widget: { ensureIndexes } }));

    await expect(connectDatabase()).rejects.toThrow("index build failed");
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // Rejected readiness clears the cache: the next request retries
    // the connection instead of running unprotected.
    await connectDatabase();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(ensureIndexes).toHaveBeenCalledTimes(2);
  });

  it("never performs destructive index or database operations", async () => {
    const content = readFileSync("db/connection.ts", "utf8");
    for (const banned of [
      "dropDatabase",
      "dropIndex",
      "dropCollection",
      ".drop(",
      "syncIndexes",
      "deleteMany({})",
    ]) {
      expect(content).not.toContain(banned);
    }
  });

  it("verifies declared indexes read-only in production without creating them", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Object.assign(process.env, VALID_ENV, {
      NODE_ENV: "production",
      APP_URL: "https://example.invalid",
    });
    const ensureIndexes = vi.fn();
    const listIndexes = vi.fn(async () => [{ key: { email: 1 }, unique: true }]);
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue(connectedInstance({
      Widget: {
        schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
        collection: { listIndexes: () => ({ toArray: listIndexes }) },
      },
    }));

    try {
      await connectDatabase();
    } finally {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }

    expect(connect).toHaveBeenCalledTimes(1);
    expect(listIndexes).toHaveBeenCalled();
    // Least privilege: the runtime never attempts index creation.
    expect(ensureIndexes).not.toHaveBeenCalled();
  });

  it("refuses to serve when a production index is missing", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Object.assign(process.env, VALID_ENV, {
      NODE_ENV: "production",
      APP_URL: "https://example.invalid",
    });
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const listIndexes = vi.fn(async () => [{ key: { _id: 1 } }]);
    vi.spyOn(mongoose, "connect").mockResolvedValue(connectedInstance({
      Widget: {
        schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
        collection: { listIndexes: () => ({ toArray: listIndexes }) },
      },
    }));

    try {
      await expect(connectDatabase()).rejects.toThrow(/missing enforced index/);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
  });

  it("refuses to serve when a production index is incompatible", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Object.assign(process.env, VALID_ENV, {
      NODE_ENV: "production",
      APP_URL: "https://example.invalid",
    });
    const listIndexes = vi.fn(async () => [{ key: { email: 1 } }]);
    vi.spyOn(mongoose, "connect").mockResolvedValue(connectedInstance({
      Widget: {
        schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
        collection: { listIndexes: () => ({ toArray: listIndexes }) },
      },
    }));

    try {
      await expect(connectDatabase()).rejects.toThrow(/incompatible enforced index/);
    } finally {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
  });
});
