/**
 * Pure CLI parsing and target validation for operational scripts.
 *
 * No Mongoose, environment loading, file-system writes, or network imports
 * live here. Tests exercise these functions with synthetic arguments only.
 */

import { resolveMongoDbName } from "@/db/mongo-config";
import {
  assertDbConfirmation,
  assertExplicitDbName,
  assertSafeWriteTarget,
  type SafeWriteTarget,
} from "./db-target-guard";

export interface VerifyIndexesArgs {
  createMissing: boolean;
  yes: boolean;
  dbName?: string;
  confirmDbName?: string;
  allowProduction: boolean;
  allowPreview: boolean;
}

export interface SeedAtlasArgs {
  dbName?: string;
  confirmDbName?: string;
  allowAtlasSeed: boolean;
}

export type MigrationMode = "dry-run" | "live" | "drop";

export interface MigrationArgs {
  mode: MigrationMode;
  dbName?: string;
  confirmDbName?: string;
  backupDir?: string;
  expectedGamelists?: string;
  confirmDropLegacy: boolean;
  allowDropLegacy: boolean;
  allowProduction: boolean;
  allowPreview: boolean;
}

function readValue(
  args: string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } | undefined {
  const arg = args[index];
  if (arg === flag) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return { value, nextIndex: index + 1 };
  }
  const prefix = `${flag}=`;
  if (arg.startsWith(prefix)) {
    const value = arg.slice(prefix.length).trim();
    if (!value) throw new Error(`${flag} requires a value`);
    return { value, nextIndex: index };
  }
  return undefined;
}

/** Parse the schema-index command without reading env or connecting. */
export function parseVerifyIndexesArgs(args: string[]): VerifyIndexesArgs {
  let createMissing = false;
  let yes = false;
  let dbName: string | undefined;
  let confirmDbName: string | undefined;
  let allowProduction = false;
  let allowPreview = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--create-missing") {
      createMissing = true;
      continue;
    }
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    if (arg === "--allow-production") {
      allowProduction = true;
      continue;
    }
    if (arg === "--allow-preview") {
      allowPreview = true;
      continue;
    }

    const dbNameValue = readValue(args, index, "--db-name");
    if (dbNameValue) {
      dbName = dbNameValue.value;
      index = dbNameValue.nextIndex;
      continue;
    }
    const confirmationValue = readValue(args, index, "--confirm-db-name");
    if (confirmationValue) {
      confirmDbName = confirmationValue.value;
      index = confirmationValue.nextIndex;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (createMissing && !yes) {
    throw new Error("--create-missing requires explicit --yes");
  }
  if (yes && !createMissing) {
    throw new Error("--yes is only valid together with --create-missing");
  }
  if (confirmDbName !== undefined && !createMissing) {
    throw new Error("--confirm-db-name is only valid with --create-missing");
  }
  if (allowProduction && !createMissing) {
    throw new Error("--allow-production is only valid with --create-missing");
  }
  if (allowPreview && !createMissing) {
    throw new Error("--allow-preview is only valid with --create-missing");
  }
  if (allowPreview && allowProduction) {
    throw new Error("choose only one hosted environment opt-in");
  }

  return {
    createMissing: createMissing && yes,
    yes,
    ...(dbName !== undefined ? { dbName } : {}),
    ...(confirmDbName !== undefined ? { confirmDbName } : {}),
    allowProduction,
    allowPreview,
  };
}

/** Parse the Atlas seed command without reading env or connecting. */
export function parseSeedAtlasArgs(args: string[]): SeedAtlasArgs {
  let dbName: string | undefined;
  let confirmDbName: string | undefined;
  let allowAtlasSeed = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--allow-atlas-seed") {
      allowAtlasSeed = true;
      continue;
    }

    const dbNameValue = readValue(args, index, "--db-name");
    if (dbNameValue) {
      dbName = dbNameValue.value;
      index = dbNameValue.nextIndex;
      continue;
    }
    const confirmationValue = readValue(args, index, "--confirm-db-name");
    if (confirmationValue) {
      confirmDbName = confirmationValue.value;
      index = confirmationValue.nextIndex;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return {
    ...(dbName !== undefined ? { dbName } : {}),
    ...(confirmDbName !== undefined ? { confirmDbName } : {}),
    allowAtlasSeed,
  };
}

/** Parse the collections-migration command without reading env or connecting. */
export function parseMigrationArgs(args: string[]): MigrationArgs {
  let dryRun = false;
  let live = false;
  let drop = false;
  let dbName: string | undefined;
  let confirmDbName: string | undefined;
  let backupDir: string | undefined;
  let expectedGamelists: string | undefined;
  let confirmDropLegacy = false;
  let allowDropLegacy = false;
  let allowProduction = false;
  let allowPreview = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === "--drop-legacy") {
      drop = true;
      continue;
    }
    if (arg === "--confirm-drop-legacy") {
      confirmDropLegacy = true;
      continue;
    }
    if (arg === "--allow-drop-legacy") {
      allowDropLegacy = true;
      continue;
    }
    if (arg === "--allow-production") {
      allowProduction = true;
      continue;
    }
    if (arg === "--allow-preview") {
      allowPreview = true;
      continue;
    }

    const dbNameValue = readValue(args, index, "--db-name");
    if (dbNameValue) {
      dbName = dbNameValue.value;
      index = dbNameValue.nextIndex;
      continue;
    }
    const confirmationValue = readValue(args, index, "--confirm-db-name");
    if (confirmationValue) {
      confirmDbName = confirmationValue.value;
      index = confirmationValue.nextIndex;
      continue;
    }
    const backupValue = readValue(args, index, "--backup-dir");
    if (backupValue) {
      backupDir = backupValue.value;
      index = backupValue.nextIndex;
      continue;
    }
    const expectedValue = readValue(args, index, "--expected-gamelists");
    if (expectedValue) {
      expectedGamelists = expectedValue.value;
      index = expectedValue.nextIndex;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  const selectedModes = [dryRun, live, drop].filter(Boolean).length;
  if (selectedModes > 1) {
    throw new Error("choose exactly one migration mode: --dry-run, --live, or --drop-legacy");
  }
  const mode: MigrationMode = live ? "live" : drop ? "drop" : "dry-run";
  if (mode === "dry-run" && allowProduction) {
    throw new Error("--allow-production is only valid with --live or --drop-legacy");
  }
  if (mode === "dry-run" && allowPreview) {
    throw new Error("--allow-preview is only valid with --live or --drop-legacy");
  }
  if (allowPreview && allowProduction) {
    throw new Error("choose only one hosted environment opt-in");
  }

  return {
    mode,
    ...(dbName !== undefined ? { dbName } : {}),
    ...(confirmDbName !== undefined ? { confirmDbName } : {}),
    ...(backupDir !== undefined ? { backupDir } : {}),
    ...(expectedGamelists !== undefined ? { expectedGamelists } : {}),
    confirmDropLegacy,
    allowDropLegacy,
    allowProduction,
    allowPreview,
  };
}

export interface VerifyIndexesTarget {
  dbName: string;
  createMissing: boolean;
  safeWrite?: SafeWriteTarget;
}

/** Resolve the B-01 target; verify-only may keep the read-only env fallback. */
export function resolveVerifyIndexesTarget(
  args: VerifyIndexesArgs,
  env: Record<string, string | undefined>,
  uri: string,
): VerifyIndexesTarget {
  if (!args.createMissing) {
    return {
      dbName: resolveMongoDbName(env, args.dbName),
      createMissing: false,
    };
  }

  const dbName = assertExplicitDbName(args.dbName);
  const safeWrite = assertSafeWriteTarget({
    uri,
    dbName,
    confirmation: args.confirmDbName,
    env,
    command: "db:indexes",
    allowProduction: args.allowProduction,
    allowPreview: args.allowPreview,
  });
  return { dbName, createMissing: true, safeWrite };
}

export interface SeedAtlasTarget {
  dbName: string;
  safeWrite: SafeWriteTarget;
}

/** Resolve the Atlas seed target before any provider or database call. */
export function resolveSeedAtlasTarget(
  args: SeedAtlasArgs,
  env: Record<string, string | undefined>,
  uri: string,
): SeedAtlasTarget {
  if (!args.allowAtlasSeed) {
    throw new Error(
      "refusing to seed without explicit --allow-atlas-seed alongside --db-name and --confirm-db-name",
    );
  }
  const dbName = assertExplicitDbName(args.dbName);
  const configured = env.MONGODB_DB_NAME?.trim();
  if (configured && configured !== dbName) {
    throw new Error(
      `MONGODB_DB_NAME (${configured}) conflicts with --db-name (${dbName}); refusing an ambiguous target`,
    );
  }
  const safeWrite = assertSafeWriteTarget({
    uri,
    dbName,
    confirmation: args.confirmDbName,
    env,
    command: "db:seed:atlas",
    requireAtlas: true,
    requireDevelopmentDatabase: true,
  });
  return { dbName, safeWrite };
}

export interface MigrationTarget {
  dbName: string;
  mode: MigrationMode;
  expectedGamelists?: number;
  safeWrite?: SafeWriteTarget;
}

/** Resolve and validate migration targets; dry-run remains read-only. */
export function resolveMigrationTarget(
  args: MigrationArgs,
  env: Record<string, string | undefined>,
  uri: string,
): MigrationTarget {
  if (args.mode === "live" && !args.backupDir) {
    throw new Error("--backup-dir is required for live runs");
  }

  let expectedGamelists: number | undefined;
  if (args.mode === "drop") {
    expectedGamelists = Number(args.expectedGamelists);
    if (
      !Number.isInteger(expectedGamelists) ||
      expectedGamelists < 0 ||
      !args.confirmDropLegacy
    ) {
      throw new Error(
        "--drop-legacy requires --expected-gamelists <n>, --confirm-drop-legacy, and --allow-drop-legacy",
      );
    }
    if (!args.allowDropLegacy) {
      throw new Error(
        "--drop-legacy requires separate --allow-drop-legacy authorization",
      );
    }
  } else if (args.allowDropLegacy || args.confirmDropLegacy || args.expectedGamelists) {
    throw new Error(
      "drop-legacy confirmation flags are only valid with --drop-legacy",
    );
  }

  if (args.mode !== "dry-run" && !args.dbName) {
    throw new Error("--db-name is required for live/drop runs");
  }

  const dbName = assertExplicitDbName(
    args.dbName ?? env.MONGODB_DB_NAME,
    args.dbName ? "--db-name" : "MONGODB_DB_NAME",
  );
  if (dbName === "test") {
    throw new Error(
      "refusing the driver default database \"test\"; pass an explicit target",
    );
  }

  if (args.mode !== "dry-run") {
    assertDbConfirmation(dbName, args.confirmDbName);
    const safeWrite = assertSafeWriteTarget({
      uri,
      dbName,
      confirmation: args.confirmDbName,
      env,
      command: args.mode === "live" ? "db:migrate:collections --live" : "db:migrate:collections --drop-legacy",
      allowProduction: args.allowProduction,
      allowPreview: args.allowPreview,
    });
    return {
      dbName,
      mode: args.mode,
      ...(expectedGamelists !== undefined ? { expectedGamelists } : {}),
      safeWrite,
    };
  }

  return {
    dbName,
    mode: args.mode,
    ...(expectedGamelists !== undefined ? { expectedGamelists } : {}),
  };
}
