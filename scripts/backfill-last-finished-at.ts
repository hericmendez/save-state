#!/usr/bin/env tsx
/**
 * lastFinishedAt backfill CLI (one-shot historical recovery).
 *
 * Usage (maintenance window only):
 *   tsx scripts/backfill-last-finished-at.ts --dry-run
 *   tsx scripts/backfill-last-finished-at.ts --live
 *
 * - Default mode is dry-run (read-only census of completion-event groups,
 *   changes nothing).
 * - --live replays surviving `game.finished` / `times_finished_changed`
 *   (to > from) events into `UserGame.lastFinishedAt`, only moving dates
 *   forward — safe to rerun. Games without events keep `null`.
 * - Requires MONGODB_URI. Never runs on build/boot/test.
 */
import mongoose from "mongoose";
import "./load-local-env";
import {
  backfillLastFinishedAt,
  collectFinishEventGroups,
} from "../server/games/service";

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  tsx scripts/backfill-last-finished-at.ts --dry-run",
      "  tsx scripts/backfill-last-finished-at.ts --live",
      "",
      "Requires MONGODB_URI in the environment.",
    ].join("\n"),
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(2);
  }
  const live = hasFlag("live");
  if (!live && !hasFlag("dry-run")) usage();

  await mongoose.connect(uri);
  try {
    if (!live) {
      const groups = await collectFinishEventGroups();
      const users = new Set(groups.map((group) => String(group.userId)));
      console.log("[dry-run] no changes made");
      console.log(
        `completion-event groups: ${groups.length} across ${users.size} user(s)`,
      );
      return;
    }
    const result = await backfillLastFinishedAt();
    console.log("[live] backfill complete");
    console.log(
      [
        `event groups: ${result.eventGroups}`,
        `updated: ${result.updated}`,
        `already current: ${result.alreadyCurrent}`,
        `ignored (no owned game): ${result.ignored}`,
      ].join("\n"),
    );
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
