import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetConnectionCache,
  connectDatabase,
} from "@/db/connection";
import { __resetServerEnvCache } from "@/lib/env";

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
});
