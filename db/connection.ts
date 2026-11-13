import "server-only";
import mongoose from "mongoose";
import {
  mongoConnectionIdentity,
  MONGOOSE_CONNECTION_OPTIONS,
  resolveMongoDbName,
} from "@/db/mongo-config";
import { loadServerEnv } from "@/lib/env";
import { logger } from "@/server/shared/logger";
import {
  verifyEnforcedModelIndexes,
  type IndexModelLike,
} from "@/db/index-management";

interface ConnectionCache {
  connection?: typeof mongoose;
  promise?: Promise<typeof mongoose>;
  identity?: string;
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
 * - Fail-closed index readiness: no request is served until the declared
 *   indexes are confirmed (see prepareIndexes/verifyIndexes below).
 */
export async function connectDatabase(
  options: { readOnlyIndexes?: boolean } = {},
): Promise<typeof mongoose> {
  const cached: ConnectionCache =
    globalThis.__saveStateMongooseCache ?? (globalThis.__saveStateMongooseCache = {});

  const { MONGODB_URI, MONGODB_DB_NAME } = loadServerEnv();
  const dbName = resolveMongoDbName(process.env, MONGODB_DB_NAME);
  const identity = mongoConnectionIdentity(MONGODB_URI, dbName);

  if (cached.identity && cached.identity !== identity) {
    throw new Error(
      "MongoDB connection is already initialized for a different URI/database in this process",
    );
  }

  if (cached.connection) {
    const readyState = cached.connection.connection?.readyState;
    if (readyState === undefined || readyState === 1) return cached.connection;
    if (readyState !== 0) {
      throw new Error("MongoDB connection is not in a reusable connected state");
    }
    // Mongoose reported a disconnected connection; let the next call retry.
    cached.connection = undefined;
    cached.promise = undefined;
    cached.identity = undefined;
  }

  if (!cached.promise) {
    mongoose.set("strictQuery", true);
    cached.identity = identity;
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName,
      ...MONGOOSE_CONNECTION_OPTIONS,
    }).catch(() => {
      throw new Error(
        "MongoDB connection failed; verify the configured URI and network settings (credentials redacted)",
      );
    }).then(async (instance) => {
      try {
        // Development and tests may build the declared indexes on demand.
        // Hosted environments (NODE_ENV=production) run with least
        // privilege and must never issue createIndex at runtime: indexes
        // are provisioned beforehand by scripts/verify-indexes.ts and only
        // verified here, read-only.
        if (process.env.NODE_ENV === "production" || options.readOnlyIndexes) {
          await verifyEnforcedModelIndexes(
            Object.values(instance.models) as unknown as IndexModelLike[],
          );
        } else {
          await Promise.all(
            Object.values(instance.models).map((model) => model.ensureIndexes()),
          );
        }
      } catch (error) {
        logger.error("Refusing database use: index readiness check failed", {
          name: error instanceof Error ? error.name : typeof error,
          message: "index readiness check failed; details omitted to prevent URI or credential disclosure",
        });
        throw error;
      }
      cached.connection = instance;
      return instance;
    });
    // A rejected connection must not poison the cache: allow retries.
    cached.promise.catch(() => {
      cached.promise = undefined;
      cached.connection = undefined;
      if (mongoose.connection.readyState === 0) cached.identity = undefined;
    });
  }

  return cached.promise;
}

/** Test-only hook: clear the connection cache between test cases. */
export function __resetConnectionCache(): void {
  globalThis.__saveStateMongooseCache = undefined;
}
