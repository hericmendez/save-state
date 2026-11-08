#!/usr/bin/env tsx
/**
 * Lists → Collections MongoDB migration CLI (Etapa 6).
 *
 * Usage (maintenance window only):
 *   pnpm db:migrate:collections --dry-run
 *   pnpm db:migrate:collections --live --backup-dir ./backups
 *   pnpm db:migrate:collections --drop-legacy --expected-gamelists N --confirm-drop-legacy
 *
 * - Default mode is dry-run (read-only census, changes nothing).
 * - --live copies gamelists → gamecollections (preserving _id), moves
 *   listIds → collectionIds, writes a JSON backup first, then verifies.
 * - --drop-legacy removes the old collection ONLY with explicit
 *   --confirm-drop-legacy and a matching --expected-gamelists count.
 * - Requires MONGODB_URI. Never runs on build/boot/test.
 */
import mongoose from "mongoose";
import "./load-local-env";
import {
  dropLegacyCollection,
  planMigration,
  runMigration,
} from "../server/collections/migration";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const raw of process.argv.slice(2)) {
    if (raw === `--${name}`) return "true";
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  return undefined;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  tsx scripts/migrate-lists-to-collections.ts --dry-run",
      "  tsx scripts/migrate-lists-to-collections.ts --live --backup-dir <dir>",
      "  tsx scripts/migrate-lists-to-collections.ts --drop-legacy --expected-gamelists <n> --confirm-drop-legacy",
      "",
      "Requires MONGODB_URI in the environment.",
    ].join("\n"),
  );
  process.exit(2);
}

function formatPlan(plan: Awaited<ReturnType<typeof planMigration>>): string {
  const lines = [
    `gamelists documents: ${plan.gameLists.total}`,
    `usergames documents: ${plan.userGames.total} (${plan.userGames.withListIds} with listIds, ${plan.userGames.listIdReferences} references)`,
    `orphan listIds: ${plan.orphanListIds.length}${plan.orphanListIds.length > 0 ? ` (${plan.orphanListIds.slice(0, 10).join(", ")}${plan.orphanListIds.length > 10 ? ", …" : ""})` : ""}`,
    `duplicate (userId,name): ${plan.duplicateNames.length}`,
    `inconsistencies: ${plan.inconsistencies.length}`,
  ];
  for (const issue of plan.inconsistencies.slice(0, 20)) lines.push(`  - ${issue}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(2);
  }
  const mode = arg("dry-run")
    ? "dry-run"
    : arg("live")
      ? "live"
      : arg("drop-legacy")
        ? "drop"
        : undefined;
  if (!mode) usage();

  await mongoose.connect(uri);
  try {
    if (mode === "dry-run") {
      const plan = await planMigration();
      console.log("[dry-run] no changes made");
      console.log(formatPlan(plan));
      if (plan.duplicateNames.length > 0) {
        console.error("[dry-run] duplicates must be resolved before a live run");
        process.exitCode = 1;
      }
      return;
    }
    if (mode === "live") {
      const backupDir = arg("backup-dir");
      if (!backupDir) {
        console.error("--backup-dir is required for live runs");
        process.exit(2);
      }
      const result = await runMigration({ backupDir });
      console.log(`[live] backup: ${result.backupFile}`);
      console.log(formatPlan(result));
      console.log(
        `[live] copied=${result.copied} alreadyPresent=${result.alreadyPresent} renamed=${result.renamed} verified=${result.verified}`,
      );
      if (!result.verified) {
        console.error("[live] VERIFICATION FAILED — restore from backup and investigate");
        process.exitCode = 1;
      }
      return;
    }
    const expected = Number(arg("expected-gamelists"));
    const confirmed = arg("confirm-drop-legacy") === "true";
    if (!Number.isInteger(expected) || expected < 0 || !confirmed) {
      console.error("--drop-legacy requires --expected-gamelists <n> and --confirm-drop-legacy");
      process.exit(2);
    }
    const { dropped } = await dropLegacyCollection({
      expectedGamelists: expected,
      confirmDropLegacy: true,
    });
    console.log(`[drop-legacy] dropped=${dropped}`);
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
