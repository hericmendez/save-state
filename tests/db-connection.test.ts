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

afterEach(() => {
  __resetConnectionCache();
  __resetServerEnvCache();
  vi.restoreAllMocks();
  delete process.env.MONGODB_URI;
  delete process.env.JWT_SECRET;
  delete process.env.APP_URL;
});

describe("connectDatabase", () => {
  it("opens a single connection across sequential calls", async () => {
    Object.assign(process.env, VALID_ENV);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(mongoose);

    const first = await connectDatabase();
    const second = await connectDatabase();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("reuses the in-flight promise under concurrency", async () => {
    Object.assign(process.env, VALID_ENV);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue(mongoose);

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

  it("ensures declared indexes before serving operations", async () => {
    Object.assign(process.env, VALID_ENV);
    const ensureIndexes = vi.fn().mockResolvedValue(undefined);
    const connect = vi
      .spyOn(mongoose, "connect")
      .mockResolvedValue({ models: { Widget: { ensureIndexes } } } as never);

    await connectDatabase();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(ensureIndexes).toHaveBeenCalledTimes(1);
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
      .mockResolvedValue({ models: { Widget: { ensureIndexes } } } as never);

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
    Object.assign(process.env, VALID_ENV, { NODE_ENV: "production" });
    const ensureIndexes = vi.fn();
    const listIndexes = vi.fn(async () => [{ key: { email: 1 }, unique: true }]);
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue({
      models: {
        Widget: {
          schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
          collection: { listIndexes: () => ({ toArray: listIndexes }) },
        },
      },
    } as never);

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
    Object.assign(process.env, VALID_ENV, { NODE_ENV: "production" });
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const listIndexes = vi.fn(async () => [{ key: { _id: 1 } }]);
    vi.spyOn(mongoose, "connect").mockResolvedValue({
      models: {
        Widget: {
          schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
          collection: { listIndexes: () => ({ toArray: listIndexes }) },
        },
      },
    } as never);

    try {
      await expect(connectDatabase()).rejects.toThrow(/missing enforced index/);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
  });

  it("refuses to serve when a production index is incompatible", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Object.assign(process.env, VALID_ENV, { NODE_ENV: "production" });
    const listIndexes = vi.fn(async () => [{ key: { email: 1 } }]);
    vi.spyOn(mongoose, "connect").mockResolvedValue({
      models: {
        Widget: {
          schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
          collection: { listIndexes: () => ({ toArray: listIndexes }) },
        },
      },
    } as never);

    try {
      await expect(connectDatabase()).rejects.toThrow(/incompatible enforced index/);
    } finally {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
  });
});
