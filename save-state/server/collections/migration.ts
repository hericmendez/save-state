/**
 * Lists → Collections MongoDB migration (Etapa 6).
 *
 * Versioned, reproducible, idempotent. NEVER auto-runs (no build/boot/
 * test hooks call this). Execution is manual via
 * scripts/migrate-lists-to-collections.ts within a maintenance window:
 * backup → dry-run → approval → live run → verify. Dropping the legacy
 * `gamelists` collection is a separate, explicitly confirmed operation.
 *
 * Data rules:
 * - GameList._id values are preserved 1:1 (insert with the same _id).
 * - UserGame.listIds values are moved to collectionIds (no re-resolution).
 * - Orphan references (listIds without a matching GameList) are migrated
 *   as-is and REPORTED, never silently discarded.
 * - Reruns are no-ops (upsert by _id; renames only where the legacy
 *   field still exists).
 *
 * NOTE: intentionally no `import "server-only"` here — this module must
 * also run under the tsx CLI. It stays server-side by location
 * (server/collections) and has zero client-side importers.
 */

import mongoose from "mongoose";

export interface CollectionCounts {
  total: number;
  withLegacyField: number;
}

export interface MigrationPlan {
  gameLists: { total: number };
  userGames: {
    total: number;
    withListIds: number;
    listIdReferences: number;
  };
  orphanListIds: string[];
  duplicateNames: Array<{ userId: string; name: string; count: number }>;
  inconsistencies: string[];
}

export interface MigrationResult extends MigrationPlan {
  copied: number;
  alreadyPresent: number;
  renamed: number;
  verified: boolean;
}

function legacyListsCollection() {
  if (!mongoose.connection.db) throw new Error("not connected");
  return mongoose.connection.db.collection("gamelists");
}

function collectionsCollection() {
  if (!mongoose.connection.db) throw new Error("not connected");
  return mongoose.connection.db.collection("gamecollections");
}

function userGamesCollection() {
  if (!mongoose.connection.db) throw new Error("not connected");
  return mongoose.connection.db.collection("usergames");
}

async function collectPlan(): Promise<MigrationPlan> {
  const lists = legacyListsCollection();
  const users = userGamesCollection();
  const inconsistencies: string[] = [];

  const totalLists = await lists.countDocuments({});
  const sample = await lists.find({}).project({ userId: 1, name: 1 }).limit(1000).toArray();
  for (const doc of sample) {
    if (doc.userId === undefined || doc.userId === null) {
      inconsistencies.push(`gamelist ${String(doc._id)} has no userId`);
    }
    if (typeof doc.name !== "string" || doc.name.trim() === "") {
      inconsistencies.push(`gamelist ${String(doc._id)} has an empty name`);
    }
  }

  const totalUserGames = await users.countDocuments({});
  const withListIds = await users.countDocuments({ listIds: { $exists: true } });
  const refAgg = await users
    .aggregate<{ count: number }>([
      { $match: { listIds: { $exists: true } } },
      { $project: { n: { $size: { $ifNull: ["$listIds", []] } } } },
      { $group: { _id: null, count: { $sum: "$n" } } },
    ])
    .toArray();
  const listIdReferences = refAgg[0]?.count ?? 0;

  // Orphans: referenced ids with no matching gamelist.
  const referenced: unknown[] = (
    await users
      .aggregate<{ ids: unknown[] }>([
        { $match: { listIds: { $exists: true } } },
        { $unwind: "$listIds" },
        { $group: { _id: null, ids: { $addToSet: "$listIds" } } },
      ])
      .toArray()
  )[0]?.ids as unknown[] ?? [];
  const existingIds = new Set(
    (
      await lists
        .find({})
        .project({ _id: 1 })
        .toArray()
    ).map((doc) => String(doc._id)),
  );
  const orphanListIds = referenced
    .map((id) => String(id))
    .filter((id) => !existingIds.has(id));

  // Duplicate (userId, name) pairs — the unique index would reject these.
  const duplicates = (await lists
    .aggregate<{ _id: { userId: unknown; name: string }; count: number }>([
      {
        $group: {
          _id: { userId: "$userId", name: "$name" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray()
  ).map((entry) => ({
    userId: String(entry._id.userId),
    name: entry._id.name,
    count: entry.count,
  }));
  for (const dup of duplicates) {
    inconsistencies.push(
      `duplicate name "${dup.name}" for user ${dup.userId} (${dup.count}x)`,
    );
  }

  return {
    gameLists: { total: totalLists },
    userGames: { total: totalUserGames, withListIds, listIdReferences },
    orphanListIds,
    duplicateNames: duplicates,
    inconsistencies,
  };
}

/** Read-only census. Safe to run anytime; changes nothing. */
export async function planMigration(): Promise<MigrationPlan> {
  return collectPlan();
}

export interface LiveRunOptions {
  /** Directory receiving the pre-run JSON backup. Required for live runs. */
  backupDir: string;
  /** Fail unless the destination collection is empty or a rerun. */
  expectCleanDestination?: boolean;
}

async function writeBackup(backupDir: string): Promise<{ backupFile: string; backedUp: number }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await mkdir(backupDir, { recursive: true });
  const lists = await legacyListsCollection().find({}).toArray();
  const stamped = await userGamesCollection()
    .find({ listIds: { $exists: true } })
    .toArray();
  const payload = {
    version: 1,
    at: new Date().toISOString(),
    gamelists: lists,
    usergamesWithListIds: stamped,
  };
  const file = join(backupDir, `lists-to-collections-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(payload));
  return { backupFile: file, backedUp: lists.length + stamped.length };
}

/**
 * Live migration. Requires a backup dir (JSON dump is written first).
 * Aborts on duplicates (unique index would reject them) — resolve and
 * rerun. Verify step runs inside the same invocation.
 */
export async function runMigration(options: LiveRunOptions): Promise<MigrationResult & { backupFile: string }> {
  const plan = await collectPlan();
  if (plan.duplicateNames.length > 0) {
    throw new Error(
      `migration aborted: ${plan.duplicateNames.length} duplicate (userId,name) pair(s); resolve before migrating`,
    );
  }
  const { backupFile, backedUp } = await writeBackup(options.backupDir);
  void backedUp;

  const dest = collectionsCollection();
  if (options.expectCleanDestination !== false) {
    const destCount = await dest.countDocuments({});
    if (destCount > 0) {
      const srcIds = new Set(
        (await legacyListsCollection().find({}).project({ _id: 1 }).toArray()).map((d) => String(d._id)),
      );
      const destIds = new Set(
        (await dest.find({}).project({ _id: 1 }).toArray()).map((d) => String(d._id)),
      );
      for (const id of destIds) {
        if (!srcIds.has(id)) {
          throw new Error(
            `migration aborted: destination holds ${destCount} document(s) not present in the source (possible divergent write)`,
          );
        }
      }
    }
  }

  // Copy with preserved _ids. Idempotent: only missing ids are inserted.
  const sourceDocs = await legacyListsCollection().find({}).toArray();
  let copied = 0;
  let alreadyPresent = 0;
  for (const doc of sourceDocs) {
    const res = await dest.updateOne(
      { _id: doc._id },
      { $setOnInsert: { ...doc } },
      { upsert: true },
    );
    if (res.upsertedCount === 1) copied += 1;
    else alreadyPresent += 1;
  }

  // Move listIds → collectionIds where the legacy field still exists.
  // Aggregation-pipeline update: atomic per document, rerun-safe.
  const renameRes = await userGamesCollection().updateMany(
    { listIds: { $exists: true } },
    [{ $set: { collectionIds: "$listIds" } }, { $unset: "listIds" }],
  );
  const renamed = renameRes.modifiedCount;

  const verified = await verifyMigration(plan.orphanListIds);
  return { ...plan, copied, alreadyPresent, renamed, verified, backupFile };
}

async function verifyMigration(knownOrphans: string[]): Promise<boolean> {
  const srcCount = await legacyListsCollection().countDocuments({});
  const destCount = await collectionsCollection().countDocuments({});
  if (srcCount !== destCount) return false;
  const srcIds = new Set(
    (await legacyListsCollection().find({}).project({ _id: 1 }).toArray()).map((d) => String(d._id)),
  );
  const destIds = await collectionsCollection().find({}).project({ _id: 1 }).toArray();
  if (!destIds.every((d) => srcIds.has(String(d._id)))) return false;
  // Field-level parity: userId + name must match per preserved _id.
  const srcById = new Map(
    (await legacyListsCollection().find({}).project({ userId: 1, name: 1 }).toArray()).map((d) => [String(d._id), d]),
  );
  const destDocs = await collectionsCollection().find({}).project({ userId: 1, name: 1 }).toArray();
  for (const dest of destDocs) {
    const src = srcById.get(String(dest._id));
    if (!src) return false;
    if (String(src.userId) !== String(dest.userId)) return false;
    if (src.name !== dest.name) return false;
  }
  // No usergame may still carry the legacy field.
  const leftover = await userGamesCollection().countDocuments({ listIds: { $exists: true } });
  if (leftover !== 0) return false;
  // Every collectionIds reference must resolve, except orphans reported
  // in the plan (migrated as-is, never fabricated, never deleted).
  const known = new Set(knownOrphans);
  const danglingIds: string[] = (
    await userGamesCollection()
      .aggregate<{ _id: null; ids: unknown[] }>([
        { $match: { collectionIds: { $exists: true } } },
        { $unwind: "$collectionIds" },
        {
          $lookup: {
            from: "gamecollections",
            localField: "collectionIds",
            foreignField: "_id",
            as: "found",
          },
        },
        { $match: { found: { $size: 0 } } },
        { $group: { _id: null, ids: { $addToSet: "$collectionIds" } } },
      ])
      .toArray()
  )[0]?.ids as string[] ?? [];
  return danglingIds.every((id) => known.has(String(id)));
}

export interface DropLegacyOptions {
  /** Guard: drop only when the source count still matches this value. */
  expectedGamelists: number;
  /** Explicit acknowledgment, no defaults. */
  confirmDropLegacy: true;
}

/**
 * Removes the legacy `gamelists` collection AFTER a verified migration.
 * Separate operation by design — never part of runMigration.
 */
export async function dropLegacyCollection(options: DropLegacyOptions): Promise<{ dropped: boolean }> {
  if (options.confirmDropLegacy !== true) {
    throw new Error("refusing to drop legacy collection without explicit confirmation");
  }
  const current = await legacyListsCollection().countDocuments({});
  if (current !== options.expectedGamelists) {
    throw new Error(
      `refusing to drop: gamelists count changed (${current} vs expected ${options.expectedGamelists}); re-validate first`,
    );
  }
  await legacyListsCollection().drop();
  return { dropped: true };
}
