import { createHash } from "node:crypto";

export const MONGOOSE_CONNECTION_OPTIONS = {
  maxPoolSize: 5,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  maxIdleTimeMS: 30_000,
} as const;

const DEFAULT_DEVELOPMENT_DB_NAME = "save-state";

/** Resolve an explicit database choice, refusing an implicit Vercel target. */
export function resolveMongoDbName(
  source: Record<string, string | undefined>,
  override?: string,
): string {
  const configured = override ?? source.MONGODB_DB_NAME;
  if (configured === undefined) {
    const isVercelDeployment =
      source.VERCEL === "1" ||
      source.VERCEL_ENV === "production" ||
      source.VERCEL_ENV === "preview";
    if (isVercelDeployment) {
      throw new Error(
        "MONGODB_DB_NAME is required on Vercel Production and Preview; refusing an implicit shared database",
      );
    }
    return DEFAULT_DEVELOPMENT_DB_NAME;
  }

  const dbName = configured.trim();
  if (!dbName) throw new Error("MONGODB_DB_NAME must not be empty");

  // MongoDB database names are limited to 63 bytes here (ASCII-only policy)
  // and exclude path/reserved punctuation to avoid URI and platform ambiguity.
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(dbName)) {
    throw new Error(
      "MONGODB_DB_NAME must be 1-63 ASCII letters, digits, underscores, or hyphens",
    );
  }
  return dbName;
}

/** Store only a one-way identity for the active connection, never its URI. */
export function mongoConnectionIdentity(uri: string, dbName: string): string {
  return createHash("sha256").update(uri).update("\0").update(dbName).digest("hex");
}
