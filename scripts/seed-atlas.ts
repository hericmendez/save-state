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
 *   pnpm db:seed:atlas
 *
 * Requires Atlas MONGODB_URI (mongodb+srv / *.mongodb.net) plus
 * MOCK_EMAIL / MOCK_PASSWORD identifying the test account. Refuses
 * local or otherwise non-Atlas targets before connecting.
 */
import mongoose from "mongoose";
import "./load-local-env";
import { IgdbSearchProvider } from "@/server/search/igdb-provider";
import {
  asAtlasSeedProvider,
  classifyMongoUri,
  runAtlasSeed,
} from "@/server/seeds/atlas-seed";

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
  const uri = required("MONGODB_URI");
  const kind = classifyMongoUri(uri);
  if (kind !== "atlas") {
    console.error(
      `refusing to proceed: target is not Atlas (classified as ${kind}). ` +
        "This script only seeds the remote Save State database.",
    );
    process.exit(2);
  }
  const email = required("MOCK_EMAIL");
  const password = required("MOCK_PASSWORD");
  console.log("target: Atlas save-state database (connection string verified as Atlas)");
  console.log(`account: ${maskEmail(email)} (reused when present, never re-passworded)`);
  console.log("mode: idempotent seed (no destructive step)");

  const provider = asAtlasSeedProvider(new IgdbSearchProvider());
  try {
    await provider.searchGames({ q: "__connectivity_probe__", page: 1, limit: 1 });
  } catch (error) {
    console.log(
      `provider note: catalog lookup unavailable (${error instanceof Error ? error.message : error}); ` +
        "titles will fall back to minimal records and be reported as incomplete.",
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
        console.log(`failed: ${failure.slug} — ${failure.reason}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
