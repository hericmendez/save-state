/**
 * Shared helpers for auth handler tests.
 *
 * Each suite starts an isolated in-memory MongoDB and points the
 * connection infrastructure at it. No developer/local MongoDB required.
 */

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { __resetConnectionCache, connectDatabase } from "@/db/connection";
import { __resetServerEnvCache } from "@/lib/env";
import { __resetRateLimitBuckets } from "@/server/auth/rate-limit";
import { User } from "@/db/models/user";

let mongoServer: MongoMemoryReplSet | undefined;

export async function startTestDatabase(): Promise<void> {
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.APP_URL = "http://test.local";
  await connectDatabase();
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  __resetConnectionCache();
  __resetServerEnvCache();
  __resetRateLimitBuckets();
  delete process.env.MONGODB_URI;
  await mongoServer?.stop();
  mongoServer = undefined;
}

export async function clearDatabase(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
  __resetRateLimitBuckets();
}

/** Explicit fixture setup for tests whose subject is unrelated to verification. */
export async function markTestUserVerified(email: string): Promise<void> {
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { emailVerifiedAt: new Date() } },
  );
  if (!user) throw new Error(`Cannot verify missing test user: ${email}`);
}

export function postRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function authedRequest(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      cookie: `token=${token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const TEST_USER = {
  name: "Auth User",
  email: "auth-user@test.com",
  password: "password-123",
} as const;
