import "server-only";
import mongoose, { type ClientSession } from "mongoose";
import { logger } from "@/server/shared/logger";

/** Run database-only authentication writes atomically on a replica set. */
export async function withAuthTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result!;
  } finally {
    try {
      await session.endSession();
    } catch (error) {
      // Cleanup trouble must not turn an already committed transaction into
      // an apparent operation failure (or mask the original transaction error).
      try {
        logger.warn("Could not close authentication database session", {
          name: error instanceof Error ? error.name : typeof error,
        });
      } catch {
        // Session cleanup is best-effort after endSession has been attempted.
      }
    }
  }
}
