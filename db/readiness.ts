import "server-only";
import mongoose from "mongoose";
import { connectDatabase } from "@/db/connection";
import {
  mongoConnectionIdentity,
  resolveMongoDbName,
} from "@/db/mongo-config";
import { loadServerEnv } from "@/lib/env";
import { Activity } from "@/db/models/activity";
import { EmailVerificationToken } from "@/db/models/email-verification-token";
import { GameCollection } from "@/db/models/game-collection";
import { GameReview } from "@/db/models/game-review";
import { GlobalGame } from "@/db/models/global-game";
import { PasswordResetToken } from "@/db/models/password-reset-token";
import { User } from "@/db/models/user";
import { UserGame } from "@/db/models/user-game";
import { UserGameNote } from "@/db/models/user-game-note";
import {
  verifyEnforcedModelIndexes,
  type IndexModelLike,
} from "@/db/index-management";

export interface ReadinessDependencies {
  connect(): Promise<void>;
  identity(): string;
  ping(): Promise<void>;
  verifyIndexes(): Promise<void>;
}

export interface ReadinessOptions {
  indexCacheMs?: number;
  connectTimeoutMs?: number;
  pingTimeoutMs?: number;
  indexTimeoutMs?: number;
}

export type ReadinessCheck = (() => Promise<void>) & { reset(): void };

interface VerificationCache {
  identity: string;
  verifiedUntil: number;
  inFlight?: Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Factory keeps timeout/cache behavior deterministic under unit tests. */
export function createReadinessCheck(
  dependencies: ReadinessDependencies,
  options: ReadinessOptions = {},
): ReadinessCheck {
  const indexCacheMs = options.indexCacheMs ?? 30_000;
  const connectTimeoutMs = options.connectTimeoutMs ?? 11_000;
  const pingTimeoutMs = options.pingTimeoutMs ?? 2_500;
  const indexTimeoutMs = options.indexTimeoutMs ?? 4_000;
  let cache: VerificationCache | undefined;

  const invalidate = () => {
    cache = undefined;
  };

  const check = async (): Promise<void> => {
    try {
      await withTimeout(dependencies.connect(), connectTimeoutMs, "MongoDB connect");
      const identity = dependencies.identity();
      if (cache?.identity !== identity) {
        cache = { identity, verifiedUntil: 0 };
      }

      await withTimeout(dependencies.ping(), pingTimeoutMs, "MongoDB ping");
      const entry = cache;
      if (!entry) throw new Error("Readiness cache unavailable");
      if (entry.verifiedUntil > Date.now()) return;

      const verification = entry.inFlight ??= withTimeout(
        dependencies.verifyIndexes(),
        indexTimeoutMs,
        "MongoDB index verification",
      );
      try {
        await verification;
        if (cache === entry) entry.verifiedUntil = Date.now() + indexCacheMs;
      } finally {
        if (entry.inFlight === verification) entry.inFlight = undefined;
      }
    } catch (error) {
      invalidate();
      throw error;
    }
  };

  return Object.assign(check, { reset: invalidate });
}

const REQUIRED_MODELS = [
  Activity,
  EmailVerificationToken,
  GameCollection,
  GameReview,
  GlobalGame,
  PasswordResetToken,
  User,
  UserGame,
  UserGameNote,
] as unknown as IndexModelLike[];

const productionReadinessCheck = createReadinessCheck({
  async connect() {
    await connectDatabase({ readOnlyIndexes: true });
  },
  identity() {
    const env = loadServerEnv();
    const dbName = resolveMongoDbName(process.env, env.MONGODB_DB_NAME);
    return mongoConnectionIdentity(env.MONGODB_URI, dbName);
  },
  async ping() {
    const connection = mongoose.connection;
    if (connection.readyState !== 1 || !connection.db) {
      throw new Error("MongoDB is not connected");
    }
    await connection.db.command({ ping: 1 }, { timeoutMS: 2_000 });
  },
  async verifyIndexes() {
    await verifyEnforcedModelIndexes(REQUIRED_MODELS);
  },
});

export const checkDatabaseReadiness: () => Promise<void> = productionReadinessCheck;

/** Test-only reset for process-local index verification cache. */
export function __resetReadinessCache(): void {
  productionReadinessCheck.reset();
}
