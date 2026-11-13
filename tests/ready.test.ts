import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as ready } from "@/app/api/ready/route";
import { User } from "@/db/models/user";
import { __resetReadinessCache } from "@/db/readiness";
import {
  clearDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "./auth/helpers";

const MONITORING_TOKEN = "synthetic-readiness-token-for-tests-only-32";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  __resetReadinessCache();
  vi.stubEnv("READINESS_PROBE_TOKEN", MONITORING_TOKEN);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  __resetReadinessCache();
});

function request(token?: string) {
  return new NextRequest("http://localhost/api/ready", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe("GET /api/ready", () => {
  it("does not probe MongoDB without a configured monitoring secret", async () => {
    vi.stubEnv("READINESS_PROBE_TOKEN", "");
    const command = vi.spyOn(mongoose.connection.db!, "command");

    const response = await ready(request(MONITORING_TOKEN));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(command).not.toHaveBeenCalled();
  });

  it("does not probe MongoDB for a missing or invalid credential", async () => {
    const command = vi.spyOn(mongoose.connection.db!, "command");

    expect((await ready(request())).status).toBe(404);
    expect((await ready(request("wrong-token"))).status).toBe(404);
    expect(command).not.toHaveBeenCalled();
  });

  it("returns only the sanitized ready contract when MongoDB and enforced indexes are available", async () => {
    const response = await ready(request(MONITORING_TOKEN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns sanitized 503 when an enforced index is missing and never provisions it", async () => {
    await User.collection.dropIndex("email_1");
    __resetReadinessCache();

    const response = await ready(request(MONITORING_TOKEN));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    const indexes = await User.collection.listIndexes().toArray();
    expect(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ email: 1 }))).toBe(false);

    await User.collection.createIndex({ email: 1 }, { unique: true });
  });

  it("does not include database details or secrets on failure", async () => {
    vi.spyOn(mongoose.connection.db!, "command").mockRejectedValueOnce(
      new Error(`failed for mongodb://private/${MONITORING_TOKEN}`),
    );

    const response = await ready(request(MONITORING_TOKEN));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"unavailable"}');
    expect(body).not.toContain(MONITORING_TOKEN);
    expect(body).not.toContain("mongodb://");
  });
});
