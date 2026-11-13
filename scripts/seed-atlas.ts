#!/usr/bin/env tsx
// NOTE: this import must stay first. It registers the local "server-only"
// stub before any @/ module is evaluated, so ops scripts run under plain
// tsx on any OS — no NODE_OPTIONS shell prefix required (Windows-safe).
import "./register-server-only-stub.mjs";
/**
 * Save State Atlas seed (30 real games + test-user library).
 *
 * Idempotent upsert through the existing domain services. Never drops,
 * never mass-deletes, never touches other users. Catalog metadata is
 * resolved via the configured search provider (IGDB); titles that cannot
 * be confirmed externally fall back to minimal manual records and are
 * reported as incomplete instead of invented.
 *
 * Usage:
 *   pnpm db:seed:atlas -- --db-name save-state-dev --confirm-db-name save-state-dev --allow-atlas-seed
 *
 * Requires Atlas MONGODB_URI (mongodb+srv / *.mongodb.net) plus
 * MOCK_EMAIL / MOCK_PASSWORD identifying the test account. Refuses
 * local or otherwise non-Atlas targets before connecting.
 */
import mongoose from "mongoose";
import { IgdbSearchProvider } from "@/server/search/igdb-provider";
import {
  asAtlasSeedProvider,
  classifyMongoUri,
  runAtlasSeed,
} from "@/server/seeds/atlas-seed";
import { isDirectExecution } from "./lib/db-target-guard";
import {
  parseSeedAtlasArgs,
  resolveSeedAtlasTarget,
} from "./lib/operational-cli";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`refusing to proceed: ${name} is required`);
    process.exit(2);
  }
  return value;
}

/** Mask a login for logs: never print the full address or any secret. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

async function main(): Promise<void> {
  await import("./load-local-env");
  const uri = required("MONGODB_URI");
  const args = parseSeedAtlasArgs(process.argv.slice(2));
  const target = resolveSeedAtlasTarget(args, process.env, uri);
  const kind = classifyMongoUri(uri);
  if (kind !== "atlas" || target.safeWrite.target !== "atlas") {
    throw new Error("refusing non-Atlas target");
  }
  // connectDatabase() reads this validated value and does not use a URI
  // default. Do this before loading credentials/provider or opening sockets.
  process.env.MONGODB_DB_NAME = target.dbName;
  const email = required("MOCK_EMAIL");
  const password = required("MOCK_PASSWORD");
  console.log(`target: Atlas; database: ${target.dbName}`);
  console.log(`account: ${maskEmail(email)} (reused when present, never re-passworded)`);
  console.log("mode: idempotent seed (no destructive step)");

  const provider = asAtlasSeedProvider(new IgdbSearchProvider());
  try {
    await provider.searchGames({ q: "__connectivity_probe__", page: 1, limit: 1 });
  } catch {
    console.log(
      "provider note: catalog lookup unavailable; titles will fall back to minimal records and be reported as incomplete.",
    );
  }

  try {
    const summary = await runAtlasSeed({ provider, email, password });
    console.log(
      `done: user ${summary.userReused ? "reused" : "created"} | ` +
        `catalog created=${summary.globalCreated} reused=${summary.globalReused} ` +
        `backfilled=${summary.globalBackfilled} | ` +
        `library created=${summary.libraryCreated} kept=${summary.libraryKept}`,
    );
    if (summary.incomplete.length > 0) {
      console.log(`incomplete metadata (${summary.incomplete.length}): ${summary.incomplete.join(", ")}`);
    }
    if (summary.failures.length > 0) {
      for (const failure of summary.failures) {
        console.log(`failed: ${failure.slug} — details omitted`);
      }
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  void main().catch((error) => {
    console.error(
      "Atlas seed refused or failed:",
      error instanceof Error ? error.name : "unknown error",
      "(details omitted to prevent credential or infrastructure disclosure)",
    );
    process.exitCode = 1;
  });
}
