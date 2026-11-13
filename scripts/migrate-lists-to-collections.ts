#!/usr/bin/env tsx
/**
 * Lists → Collections MongoDB migration CLI (Etapa 6).
 *
 * Usage (maintenance window only):
 *   pnpm db:migrate:collections -- --dry-run --db-name save-state-dev
 *   pnpm db:migrate:collections -- --live --backup-dir ./backups --db-name save-state-dev --confirm-db-name save-state-dev
 *   pnpm db:migrate:collections -- --drop-legacy --expected-gamelists N --confirm-drop-legacy --allow-drop-legacy --db-name save-state-dev --confirm-db-name save-state-dev
 *
 * - Default mode is dry-run (read-only census, changes nothing).
 * - --live copies gamelists → gamecollections (preserving _id), moves
 *   listIds → collectionIds, writes a JSON backup first, then verifies.
 * - --drop-legacy removes the old collection ONLY with explicit
 *   --confirm-drop-legacy and a matching --expected-gamelists count.
 * - Requires MONGODB_URI and an explicit database for all modes.
 * - Live requires nominal database confirmation. Drop additionally requires
 *   --allow-drop-legacy. Never runs on build/boot/test.
 */
import mongoose from "mongoose";
import {
  dropLegacyCollection,
  planMigration,
  runMigration,
} from "../server/collections/migration";
import { formatTargetSummary, isDirectExecution } from "./lib/db-target-guard";
import {
  parseMigrationArgs,
  resolveMigrationTarget,
} from "./lib/operational-cli";

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
  await import("./load-local-env");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(2);
  }
  const args = parseMigrationArgs(process.argv.slice(2));
  const target = resolveMigrationTarget(args, process.env, uri);
  const { mode, dbName } = target;
  console.log(formatTargetSummary(uri, dbName));
  console.log(`mode: ${mode}`);

  await mongoose.connect(uri, { dbName, autoIndex: false });
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
      const backupDir = args.backupDir!;
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
    const { dropped } = await dropLegacyCollection({
      expectedGamelists: target.expectedGamelists!,
      confirmDropLegacy: true,
    });
    console.log(`[drop-legacy] dropped=${dropped}`);
  } finally {
    await mongoose.disconnect();
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(
      "collections migration refused or failed:",
      error instanceof Error ? error.name : "unknown error",
      "(details omitted to prevent credential or infrastructure disclosure)",
    );
    process.exitCode = 1;
  });
}
