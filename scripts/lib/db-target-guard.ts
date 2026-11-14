/**
 * Pure operational database-target guards shared by maintenance scripts.
 *
 * This module must stay free of Mongoose, environment loading, and network
 * imports so it can be unit-tested without credentials or a database.
 */

import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMongoDbName } from "@/db/mongo-config";

export const DEVELOPMENT_DATABASE_NAME = "save-state-dev";
export const FORBIDDEN_DEVELOPMENT_DATABASE_NAMES = ["save-state", "test"] as const;

export type MongoTargetKind = "atlas" | "local" | "other";
export type ExecutionEnvironment = "development" | "preview" | "production";

export interface SafeWriteTarget {
  dbName: string;
  target: MongoTargetKind;
  production: boolean;
}

export interface SafeWriteTargetOptions {
  uri: string;
  dbName: string;
  confirmation: string | undefined;
  env: Record<string, string | undefined>;
  command: string;
  /** Explicit future escape hatch for reviewed production provisioning. */
  allowProduction?: boolean;
  allowPreview?: boolean;
  /** Seed/migration commands that must only target Atlas development. */
  requireAtlas?: boolean;
  requireDevelopmentDatabase?: boolean;
}

/** Classify a MongoDB URI without exposing credentials or topology. */
export function classifyMongoTarget(uri: string): MongoTargetKind {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return "other";
  }
  const host = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === "mongodb+srv:" || parsed.protocol === "mongodb:") &&
    host.endsWith(".mongodb.net")
  ) {
    return "atlas";
  }
  if (
    parsed.protocol === "mongodb:" &&
    (host === "localhost" || host === "127.0.0.1" || host === "[::1]")
  ) {
    return "local";
  }
  return "other";
}

/** True when the process is clearly running in a production context. */
export function isProductionContext(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production" ||
    (env.VERCEL === "1" && env.VERCEL_ENV === undefined)
  );
}

export function isPreviewContext(
  env: Record<string, string | undefined>,
): boolean {
  return env.VERCEL_ENV === "preview";
}

/** Require a non-empty, valid database name from an explicit source. */
export function assertExplicitDbName(
  value: string | undefined,
  source = "--db-name",
): string {
  const dbName = value?.trim();
  if (!dbName || dbName.startsWith("--")) {
    throw new Error(`${source} requires a non-empty database name`);
  }
  // Reuse the application's single database-name validation strategy.
  return resolveMongoDbName({ MONGODB_DB_NAME: dbName });
}

/** The nominal confirmation must exactly match the selected database. */
export function assertDbConfirmation(
  dbName: string,
  confirmation: string | undefined,
): void {
  if (confirmation?.trim() !== dbName) {
    throw new Error(
      `--confirm-db-name must exactly match --db-name (${dbName}) before any persistent operation`,
    );
  }
}

/**
 * Fail-closed policy for commands that may create or modify data/indexes.
 *
 * Development writes to Atlas are restricted to the approved isolated
 * database. Local test databases remain usable for isolated test suites.
 * A future, reviewed production flow must explicitly opt in with
 * `allowProduction`, and still requires an explicit name and confirmation.
 */
export function assertSafeWriteTarget(
  options: SafeWriteTargetOptions,
): SafeWriteTarget {
  const target = classifyMongoTarget(options.uri);
  const production = isProductionContext(options.env);
  const preview = isPreviewContext(options.env);

  if (options.requireAtlas && target !== "atlas") {
    throw new Error(
      `${options.command} only runs against Atlas; refusing target classified as ${target}`,
    );
  }

  if (production && !options.allowProduction) {
    throw new Error(
      `${options.command} refuses a production context without an explicit reviewed --allow-production opt-in`,
    );
  }

  if (preview && !options.allowPreview) {
    throw new Error(
      `${options.command} refuses a Preview context without explicit --allow-preview opt-in`,
    );
  }

  if (!production && !preview) {
    if (options.dbName === "test") {
      throw new Error(
        `${options.command} refuses the driver default database "test"; pass an explicit target`,
      );
    }

    if (target === "other") {
      throw new Error(
        `${options.command} refuses an unsupported remote target; use a local test database or Atlas development`,
      );
    }

    if (target === "atlas") {
      if (
        (FORBIDDEN_DEVELOPMENT_DATABASE_NAMES as readonly string[]).includes(
          options.dbName,
        )
      ) {
        throw new Error(
          `${options.command} refuses the legacy/default database "${options.dbName}" in development`,
        );
      }
      if (options.dbName !== DEVELOPMENT_DATABASE_NAME) {
        throw new Error(
          `${options.command} only permits Atlas writes to ${DEVELOPMENT_DATABASE_NAME} in development`,
        );
      }
    }
  }

  if ((production || preview) && options.requireDevelopmentDatabase) {
    throw new Error(
      `${options.command} is development-only and cannot run in a production context`,
    );
  }

  if (production && options.dbName === "test") {
    throw new Error(
      `${options.command} refuses the driver default database "test" in production`,
    );
  }

  assertDbConfirmation(options.dbName, options.confirmation);

  return { dbName: options.dbName, target, production };
}

/** Safe log line: classification and database only, never URI/host/user. */
export function formatTargetSummary(uri: string, dbName: string): string {
  return `target: ${classifyMongoTarget(uri)}; database: ${dbName}`;
}

/** True only when this module/script is the process entrypoint. */
export function isDirectExecution(
  metaUrl: string,
  argv1: string | undefined,
): boolean {
  if (!argv1) return false;
  try {
    return pathToFileURL(resolvePath(argv1)).href === metaUrl;
  } catch {
    return false;
  }
}
