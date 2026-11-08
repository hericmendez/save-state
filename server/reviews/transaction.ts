import "server-only";
import mongoose from "mongoose";
import type { ClientSession } from "mongoose";

/**
 * Transaction policy (Phase 1).
 *
 * - UserGame + GameReview writes run inside a Mongoose transaction, so a
 *   failure never leaves half-persisted review data.
 * - Transactions REQUIRE a replica set (Atlas provides one; local/dev and
 *   tests must run a replica set — see tests/auth/helpers.ts which uses
 *   MongoMemoryReplSet). Single-node standalone mongod CANNOT run
 *   transactions and fails fast here with an explicit error instead of a
 *   silent non-atomic fallback.
 * - Retry note: `withTransaction` retries ONLY errors labeled
 *   TransientTransactionError by the driver. Duplicate-key (11000) and
 *   validation errors abort without retry and propagate unchanged, so
 *   callers can map them (e.g. createGame → GAME_ALREADY_IN_LIBRARY).
 */
export function isTransactionUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Transaction numbers are only allowed on a replica set") ||
    message.includes("replica set") ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: number }).code === 20)
  );
}

export async function withReviewTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new Error(
        "Review writes require a MongoDB replica set (transactions). " +
          "Use a replica set locally (e.g. `mongod --replSet rs0`) — " +
          "Atlas already provides one. Refusing silent non-atomic write.",
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
