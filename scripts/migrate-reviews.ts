#!/usr/bin/env tsx
// NOTE: this import must stay first. It registers the local "server-only"
// stub before any @/ module is evaluated, so ops scripts run under plain
// tsx on any OS — no NODE_OPTIONS shell prefix required (Windows-safe).
import "./register-server-only-stub.mjs";
/**
 * GameReview migration CLI (Phase 1).
 *
 *   pnpm db:migrate:reviews              # dry-run (default, read-only)
 *   pnpm db:migrate:reviews -- --live --yes   # create missing GameReviews
 *
 * - Default (no flags) is dry-run: changes NOTHING; reports scanned,
 *   withLegacy, eligible, alreadyMigrated, excerptMissing/Stale,
 *   conflicts, errors.
 * - Live mode requires BOTH --live AND --yes.
 * - --dry-run and --live together are rejected (choose one).
 * - Never deletes UserGame.review, never prints review content or secrets
 *   (only counts and up to 12 document ids for conflicts/errors).
 * - Requires MONGODB_URI. Never runs on build/boot/test.
 */
import mongoose from "mongoose";
import "./load-local-env";
import {
  formatReviewMigrationReport,
  planReviewMigration,
  runReviewMigrationLive,
} from "../server/reviews/migration";

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  tsx scripts/migrate-reviews.ts [--dry-run] [--help]",
      "  tsx scripts/migrate-reviews.ts --live --yes",
      "",
      "Requires MONGODB_URI in the environment.",
    ].join("\n"),
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (uri === undefined || uri === "") {
    console.error("refusing to proceed: MONGODB_URI is required");
    process.exit(2);
  }
  const live = hasFlag("live");
  const dry = hasFlag("dry-run");
  if (hasFlag("help") || hasFlag("h")) usage();
  if (live && dry) {
    console.error("choose one: --dry-run or --live --yes (not both)");
    process.exit(2);
  }
  if (live && !hasFlag("yes")) {
    console.error("refusing live run: --live requires explicit --yes");
    process.exit(2);
  }

  let host = "(unparseable)";
  try {
    host = new URL(uri.replace(/^mongodb\+srv:\/\//, "https://")).host;
  } catch {
    host = "(unparseable)";
  }
  console.log(`target host: ${host}`);

  await mongoose.connect(uri, { dbName: "save-state" });
  try {
    if (!live) {
      const report = await planReviewMigration();
      console.log("[dry-run] no changes made");
      console.log(formatReviewMigrationReport(report, "dry-run"));
      if (report.errors > 0) process.exitCode = 1;
      return;
    }
    const report = await runReviewMigrationLive();
    console.log(formatReviewMigrationReport(report, "live"));
    if (report.errors > 0) {
      console.error("[live] completed with errors — investigate before rerun");
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
