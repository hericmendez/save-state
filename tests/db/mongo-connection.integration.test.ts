import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { __resetConnectionCache, connectDatabase } from "@/db/connection";
import { __resetServerEnvCache } from "@/lib/env";

const TEMP_DB_NAME = "save-state-connection-isolated-test";
let mongo: MongoMemoryServer;
const originalEnv = Object.fromEntries(
  ["MONGODB_URI", "MONGODB_DB_NAME", "JWT_SECRET", "NODE_ENV", "APP_URL"].map(
    (key) => [key, process.env[key]],
  ),
) as Record<string, string | undefined>;

function restoreTestEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  // Intentionally include a conflicting URI path: the explicit dbName option
  // must select TEMP_DB_NAME and this ephemeral mongod is the only target.
  process.env.MONGODB_URI = mongo.getUri("uri-path-must-not-win");
  process.env.MONGODB_DB_NAME = TEMP_DB_NAME;
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.APP_URL = "https://example.invalid";
  process.env.JWT_SECRET = "isolated-connection-test-secret-32chars";
  __resetServerEnvCache();
}, 120_000);

afterAll(async () => {
  try {
    await mongoose.disconnect();
    __resetConnectionCache();
    await mongo?.stop();
  } finally {
    restoreTestEnv();
    __resetServerEnvCache();
  }
});

describe("isolated MongoDB connection", () => {
  it("uses the explicit database name instead of the URI path and reuses it", async () => {
    const first = await connectDatabase();
    expect(first.connection.name).toBe(TEMP_DB_NAME);
    expect(first.connection.host).toBe("127.0.0.1");
    await expect(connectDatabase()).resolves.toBe(first);
  }, 120_000);
});
