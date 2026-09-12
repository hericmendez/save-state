import "server-only";
import mongoose from "mongoose";
import { loadServerEnv } from "@/lib/env";

interface ConnectionCache {
  connection?: typeof mongoose;
  promise?: Promise<typeof mongoose>;
}

declare global {
  // Global cache entry: survives Next.js development hot reload.
  var __saveStateMongooseCache: ConnectionCache | undefined;
}

/**
 * Cached Mongoose connection for Next.js.
 *
 * - Reuses an established connection across invocations.
 * - Reuses the in-flight connection promise under concurrency.
 * - Survives development hot reload via a global cache entry.
 * - Never opens a connection per request.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  const cached: ConnectionCache =
    globalThis.__saveStateMongooseCache ?? (globalThis.__saveStateMongooseCache = {});

  if (cached.connection) return cached.connection;

  if (!cached.promise) {
    const { MONGODB_URI } = loadServerEnv();
    mongoose.set("strictQuery", true);
    cached.promise = mongoose.connect(MONGODB_URI).then((instance) => {
      cached.connection = instance;
      return instance;
    });
    // A rejected connection must not poison the cache: allow retries.
    cached.promise.catch(() => {
      cached.promise = undefined;
      cached.connection = undefined;
    });
  }

  return cached.promise;
}

/** Test-only hook: clear the connection cache between test cases. */
export function __resetConnectionCache(): void {
  globalThis.__saveStateMongooseCache = undefined;
}
