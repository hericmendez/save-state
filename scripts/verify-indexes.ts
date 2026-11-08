#!/usr/bin/env tsx
// NOTE: this import must stay first. It registers the local "server-only"
// stub before any @/ module is evaluated, so ops scripts run under plain
// tsx on any OS — no NODE_OPTIONS shell prefix required (Windows-safe).
import "./register-server-only-stub.mjs";
/**
 * Save State index verifier (readiness gate for deploy).
 *
 * Compares the unique indexes declared by the Mongoose schemas with the
 * indexes actually present in the target database and reports:
 * missing, incompatible (same key, different options), and duplicate
 * documents that would block unique index creation.
 *
 * VERIFY-ONLY by default: never creates, drops, or rebuilds anything,
 * never deletes or modifies documents. With BOTH `--create-missing`
 * and `--yes`, it creates the missing declared indexes (create-only)
 * after printing the plan. Destructive operations do not exist here.
 *
 * Usage:
 *   pnpm db:indexes               # verify only (add script entry)
 *   pnpm db:indexes -- --create-missing --yes
 *
 * Requires MONGODB_URI (any target; prints only the host, never secrets).
 */
import mongoose from "mongoose";
import "./load-local-env";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { GameReview } from "@/db/models/game-review";
import { GameCollection } from "@/db/models/game-collection";
import { User } from "@/db/models/user";
import { PasswordResetToken } from "@/db/models/password-reset-token";

interface ExpectedIndex {
  collection: string;
  model: string;
  key: Record<string, number>;
  options: Record<string, unknown>;
  critical: boolean;
  reason: string;
}

/** Critical = uniqueness/integrity invariants enforced via E11000. */
const EXPECTED: ExpectedIndex[] = [
  { collection: "users", model: "User", key: { email: 1 }, options: { unique: true }, critical: true, reason: "duplicate email registration" },
  { collection: "globalgames", model: "GlobalGame", key: { slug: 1 }, options: { unique: true }, critical: true, reason: "canonical game identity" },
  { collection: "globalgames", model: "GlobalGame", key: { name: 1 }, options: { unique: true, partialFilterExpression: { source: "manual" } }, critical: true, reason: "manual game dedup under concurrency" },
  { collection: "globalgames", model: "GlobalGame", key: { atpDomainId: 1 }, options: { unique: true, sparse: true }, critical: true, reason: "ATP canonical identity" },
  { collection: "globalgames", model: "GlobalGame", key: { igdbId: 1 }, options: { unique: true, sparse: true }, critical: true, reason: "IGDB canonical identity" },
  { collection: "usergames", model: "UserGame", key: { userId: 1, gameId: 1 }, options: { unique: true }, critical: true, reason: "one library entry per user+game" },
  { collection: "gamereviews", model: "GameReview", key: { userGameId: 1 }, options: { unique: true }, critical: true, reason: "optional 1:1 review per library entry" },
  { collection: "gamecollections", model: "GameCollection", key: { userId: 1, name: 1 }, options: { unique: true }, critical: true, reason: "one list name per user" },
  { collection: "passwordresettokens", model: "PasswordResetToken", key: { token: 1 }, options: { unique: true }, critical: false, reason: "single-use reset tokens" },
];

function sameKey(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mask(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes("@")) {
    const at = s.indexOf("@");
    return `${s[0]}***${s.slice(at)}`;
  }
  return s.length > 24 ? `${s.slice(0, 12)}…(${s.length})` : s;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("refusing to proceed: MONGODB_URI is required");
    process.exit(2);
  }
  let host = "(unparseable)";
  try {
    host = new URL(uri.replace(/^mongodb\+srv:\/\//, "https://")).host;
  } catch {
    host = "(unparseable)";
  }
  const args = new Set(process.argv.slice(2));
  const createMissing = args.has("--create-missing") && args.has("--yes");
  if (args.has("--create-missing") && !args.has("--yes")) {
    console.error("refusing to create: --create-missing requires explicit --yes");
    process.exit(2);
  }

  console.log(`target host: ${host}`);
  await mongoose.connect(uri, { dbName: "save-state", serverSelectionTimeoutMS: 10000 });
  const collectionOf: Record<string, string> = {
    User: User.collection.name,
    GlobalGame: GlobalGame.collection.name,
    UserGame: UserGame.collection.name,
    GameReview: GameReview.collection.name,
    GameCollection: GameCollection.collection.name,
    PasswordResetToken: PasswordResetToken.collection.name,
  };
  try {
    let problems = 0;
    for (const exp of EXPECTED) {
      const coll = mongoose.connection.collection(collectionOf[exp.model] ?? exp.collection);
      const existing = (await coll.listIndexes().toArray()) as unknown as Array<
        Record<string, unknown>
      >;
      const match = existing.find((ix) => sameKey((ix.key ?? {}) as Record<string, unknown>, exp.key));
      if (!match) {
        problems += 1;
        console.log(`MISSING [${exp.critical ? "critical" : "non-critical"}] ${exp.model} ${JSON.stringify(exp.key)} (${exp.reason})`);
        if (createMissing) {
          await coll.createIndex(
            exp.key as Record<string, 1 | -1>,
            exp.options as Parameters<typeof coll.createIndex>[1],
          );
          console.log(`  created (create-only, no drops)`);
        }
        continue;
      }
      const opts = match as Record<string, unknown>;
      const wantUnique = exp.options.unique === true;
      const wantSparse = exp.options.sparse === true;
      const wantPartial = JSON.stringify((exp.options as { partialFilterExpression?: unknown }).partialFilterExpression ?? null);
      const gotPartial = JSON.stringify((opts.partialFilterExpression as unknown) ?? null);
      if (!!opts.unique !== wantUnique || !!opts.sparse !== wantSparse || gotPartial !== wantPartial) {
        problems += 1;
        console.log(
          `INCOMPATIBLE [${exp.critical ? "critical" : "non-critical"}] ${exp.model} ${JSON.stringify(exp.key)} ` +
            `(db unique=${!!opts.unique} sparse=${!!opts.sparse} partial=${gotPartial}) — resolve manually, never auto-dropped`,
        );
      }
    }
    // Duplicate scan for plain (non-partial, non-sparse) unique keys.
    for (const exp of EXPECTED.filter((e) => e.options.unique === true && !e.options.sparse && !(e.options as { partialFilterExpression?: unknown }).partialFilterExpression)) {
      const fields = Object.keys(exp.key);
      const groupId: Record<string, string> = {};
      for (const f of fields) groupId[f] = `$${f}`;
      const dupes = (await mongoose.connection
        .collection(collectionOf[exp.model] ?? exp.collection)
        .aggregate([
          { $group: { _id: groupId, n: { $sum: 1 } } },
          { $match: { n: { $gt: 1 } } },
          { $limit: 5 },
        ])
        .toArray()) as unknown as Array<{ _id?: unknown; n?: number }>;
      if (dupes.length > 0) {
        problems += 1;
        console.log(
          `DUPLICATES [${exp.critical ? "critical" : "non-critical"}] ${exp.model} ${JSON.stringify(exp.key)}: ` +
            `${dupes.length}+ shown (max 5): ` +
            dupes.map((d) => JSON.stringify(d._id, (_, v) => (typeof v === "string" ? mask(v) : v))).join("; "),
        );
      }
    }
    if (problems === 0) {
      console.log("OK: all declared unique indexes present and compatible; no blocking duplicates sampled");
    } else {
      console.log(`FOUND ${problems} problem(s) above; writes relying on missing guarantees will be refused at runtime until resolved`);
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("index verification failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
