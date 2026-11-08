import "server-only";
import mongoose from "mongoose";
import { loadServerEnv } from "@/lib/env";
import { logger } from "@/server/shared/logger";

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
 * - Fail-closed index readiness: no request is served until the declared
 *   indexes are confirmed (see prepareIndexes/verifyIndexes below).
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  const cached: ConnectionCache =
    globalThis.__saveStateMongooseCache ?? (globalThis.__saveStateMongooseCache = {});

  if (cached.connection) return cached.connection;

  if (!cached.promise) {
    const { MONGODB_URI } = loadServerEnv();
    mongoose.set("strictQuery", true);
    // The Atlas URI carries no database path (mongodb+srv form), while the
    // local URI already points at /save-state. Pin the database explicitly
    // so both resolve to the Save State database instead of the driver
    // default ("test") when the path is absent.
    cached.promise = mongoose.connect(MONGODB_URI, { dbName: "save-state" }).then(async (instance) => {
      try {
        // Development and tests may build the declared indexes on demand.
        // Hosted environments (NODE_ENV=production) run with least
        // privilege and must never issue createIndex at runtime: indexes
        // are provisioned beforehand by scripts/verify-indexes.ts and only
        // verified here, read-only.
        if (process.env.NODE_ENV === "production") {
          await verifyIndexes(instance);
        } else {
          await Promise.all(
            Object.values(instance.models).map((model) => model.ensureIndexes()),
          );
        }
      } catch (error) {
        logger.error("Refusing database use: index readiness check failed", {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : undefined,
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
    });
  }

  return cached.promise;
}

type IndexSpec = {
  fields: Record<string, unknown>;
  options: Record<string, unknown>;
};

function indexIdentity(spec: IndexSpec): string {
  return JSON.stringify(spec.fields);
}

/**
 * Integrity-relevant index options. Only these dimensions gate readiness:
 * uniqueness/sparseness/partial filters/TTL define correctness invariants.
 * Anything else (names, background builds) is ignored.
 */
function enforcedOptions(options: Record<string, unknown>): Record<string, unknown> {
  return {
    unique: options.unique === true,
    sparse: options.sparse === true,
    partialFilterExpression: (options.partialFilterExpression ?? null) as unknown,
    expireAfterSeconds: (options.expireAfterSeconds ?? null) as unknown,
  };
}

function isEnforced(options: Record<string, unknown>): boolean {
  const normalized = enforcedOptions(options);
  return (
    normalized.unique === true ||
    typeof normalized.expireAfterSeconds === "number"
  );
}

/**
 * Read-only verification of the declared indexes: every index declared by
 * a registered model that carries integrity semantics (unique, sparse,
 * partial, TTL) must exist with identical enforced options. Pure metadata
 * reads (`listIndexes`); never creates, drops, or rebuilds anything, so
 * the runtime database user needs no index-management privileges.
 */
async function verifyIndexes(instance: typeof mongoose): Promise<void> {
  for (const [name, model] of Object.entries(instance.models)) {
    const declared = (model.schema.indexes() as unknown as Array<
      [Record<string, unknown>, Record<string, unknown>?]
    >);
    if (declared.length === 0) continue;
    const existing = (await model.collection.listIndexes().toArray()) as unknown as Array<
      Record<string, unknown>
    >;
    for (const [fields, rawOptions = {}] of declared) {
      const expected: IndexSpec = { fields, options: rawOptions };
      if (!isEnforced(expected.options)) continue;
      const match = existing.find(
        (index) =>
          JSON.stringify(index.key ?? {}) === indexIdentity(expected),
      );
      if (!match) {
        throw new Error(
          `missing enforced index on model "${name}": ${indexIdentity(expected)}`,
        );
      }
      const actual = enforcedOptions(match as Record<string, unknown>);
      const wanted = enforcedOptions(expected.options);
      if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
        throw new Error(
          `incompatible enforced index on model "${name}": ${indexIdentity(expected)}`,
        );
      }
    }
  }
}

/** Test-only hook: clear the connection cache between test cases. */
export function __resetConnectionCache(): void {
  globalThis.__saveStateMongooseCache = undefined;
}
