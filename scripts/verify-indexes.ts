#!/usr/bin/env tsx
// NOTE: this import must stay first. It registers the local "server-only"
// stub before any @/ module is evaluated, so ops scripts run under plain
// tsx on any OS — no NODE_OPTIONS shell prefix required (Windows-safe).
import "./register-server-only-stub.mjs";
/**
 * Schema-driven MongoDB index verifier and create-only provisioner.
 *
 * Verify-only by default. Index creation requires BOTH --create-missing and
 * --yes, plus an explicit --db-name confirmed by --confirm-db-name.
 * Existing indexes are never removed, replaced, or synchronized.
 *
 * Usage:
 *   pnpm db:indexes
 *   pnpm db:indexes -- --db-name save-state-dev
 *   pnpm db:indexes -- --db-name save-state-dev --confirm-db-name save-state-dev --create-missing --yes
 *
 * Database selection for verify-only: --db-name, then MONGODB_DB_NAME;
 * outside Vercel, the development fallback is "save-state". Writes require
 * an explicit --db-name and matching --confirm-db-name; Atlas development
 * writes are restricted to save-state-dev. The selected database is printed
 * before any operation, never its hostname or URI. An explicit dbName is
 * passed to Mongoose; a URI pathname does not override it.
 */
import mongoose from 'mongoose';
import { formatTargetSummary, isDirectExecution } from './lib/db-target-guard';
import { indexAuditConnectionOptions } from './lib/index-audit-options';
import {
  parseVerifyIndexesArgs,
  resolveVerifyIndexesTarget,
} from './lib/operational-cli';
import {
  inspectModelIndexes,
  provisionMissingIndexes,
  type IndexInspection,
  type IndexModelLike,
} from '@/db/index-management';

async function loadModels(): Promise<IndexModelLike[]> {
  // Connect options must be applied before model compilation/Model.init().
  const [
    { Activity },
    { GameCollection },
    { GameReview },
    { GlobalGame },
    { PasswordResetToken },
    { EmailVerificationToken },
    { User },
    { UserGameNote },
    { UserGame },
  ] = await Promise.all([
    import('@/db/models/activity'),
    import('@/db/models/game-collection'),
    import('@/db/models/game-review'),
    import('@/db/models/global-game'),
    import('@/db/models/password-reset-token'),
    import('@/db/models/email-verification-token'),
    import('@/db/models/user'),
    import('@/db/models/user-game-note'),
    import('@/db/models/user-game'),
  ]);

  return [
    User,
    GlobalGame,
    UserGame,
    GameReview,
    GameCollection,
    PasswordResetToken,
    EmailVerificationToken,
    Activity,
    UserGameNote,
  ] as unknown as IndexModelLike[];
}

function formatIndex(item: IndexInspection): string {
  return `${item.model} ${JSON.stringify(item.fields)}`;
}

async function findDuplicateValues(
  model: IndexModelLike,
  item: IndexInspection,
): Promise<Array<{ _id?: unknown; n?: number }>> {
  const collection = model.collection as unknown as {
    aggregate(pipeline: unknown[]): {
      toArray(): Promise<Array<{ _id?: unknown; n?: number }>>;
    };
  };
  const matchParts: Record<string, unknown>[] = [];
  const partial = item.options.partialFilterExpression;
  if (partial && typeof partial === 'object') {
    matchParts.push(partial as Record<string, unknown>);
  }
  if (item.options.sparse === true) {
    matchParts.push({
      $or: Object.keys(item.fields).map((field) => ({
        [field]: { $exists: true },
      })),
    });
  }

  const groupId = Object.fromEntries(
    Object.keys(item.fields).map((field) => [field, `$${field}`]),
  );
  const pipeline: unknown[] = [];
  if (matchParts.length === 1) pipeline.push({ $match: matchParts[0] });
  else if (matchParts.length > 1) pipeline.push({ $match: { $and: matchParts } });
  pipeline.push(
    { $group: { _id: groupId, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 5 },
  );
  return collection.aggregate(pipeline).toArray();
}

async function main(): Promise<void> {
  await import('./load-local-env');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required; refusing to proceed');

  const args = parseVerifyIndexesArgs(process.argv.slice(2));
  const target = resolveVerifyIndexesTarget(args, process.env, uri);
  const { dbName, createMissing } = target;

  console.log(formatTargetSummary(uri, dbName));
  console.log(`mode: ${createMissing ? 'create missing only (--yes confirmed)' : 'verify-only'}`);

  try {
    await mongoose.connect(uri, {
      ...indexAuditConnectionOptions(dbName),
    });
  } catch {
    throw new Error(
      'MongoDB connection failed; verify the configured URI and network settings (credentials redacted)',
    );
  }

  try {
    const MODELS = await loadModels();
    const initial = await Promise.all(MODELS.map(inspectModelIndexes));
    const inspections = initial.flat();
    const missing = inspections.filter((item) => item.status === 'missing');
    const incompatible = inspections.filter((item) => item.status === 'incompatible');

    for (const item of missing) {
      console.log(`MISSING ${formatIndex(item)} options=${JSON.stringify(item.options)}`);
    }
    for (const item of incompatible) {
      console.error(
        `INCOMPATIBLE ${formatIndex(item)} expected=${JSON.stringify(item.options)} actual=${JSON.stringify(item.actualOptions)}`,
      );
    }

    if (incompatible.length > 0) {
      throw new Error(
        `${incompatible.length} incompatible index(es); resolve manually. No indexes were created.`,
      );
    }

    if (createMissing && missing.length > 0) {
      // Check unique-index conflicts before making any index changes. An
      // empty/missing collection has no indexes; skip its aggregation.
      const duplicateProblems: string[] = [];
      for (const model of MODELS) {
        const modelMissing = missing.filter(
          (item) => item.model === model.modelName && item.options.unique === true,
        );
        if (modelMissing.length === 0) continue;
        const currentIndexes = await model.collection.listIndexes().toArray().catch((error: unknown) => {
          if (
            typeof error === 'object' &&
            error !== null &&
            (error as { code?: unknown }).code === 26
          ) return [];
          throw error;
        });
        if (currentIndexes.length === 0) continue;
        for (const item of modelMissing) {
          const duplicates = await findDuplicateValues(model, item);
          if (duplicates.length > 0) {
            duplicateProblems.push(
              `${formatIndex(item)} duplicate_groups=${duplicates.length}`,
            );
          }
        }
      }
      if (duplicateProblems.length > 0) {
        throw new Error(
          `duplicate documents prevent unique index creation; no indexes were created: ${duplicateProblems.join('; ')}`,
        );
      }

      console.log(`provisioning ${missing.length} missing schema index(es)`);
      const finalState = await provisionMissingIndexes(MODELS);
      const remaining = finalState.filter((item) => item.status !== 'present');
      if (remaining.length > 0) {
        throw new Error(
          `post-provision verification failed: ${remaining.map((item) => `${item.status} ${formatIndex(item)}`).join('; ')}`,
        );
      }
      console.log(`OK: all ${finalState.length} schema indexes present and compatible`);
      return;
    }

    if (missing.length > 0) {
      throw new Error(`${missing.length} declared index(es) are missing; no writes performed`);
    }

    console.log(`OK: all ${inspections.length} schema indexes present and compatible`);
  } finally {
    await mongoose.disconnect();
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(
      'index verification/provisioning failed:',
      error instanceof Error ? error.name : 'unknown error',
      '(details omitted to prevent URI or infrastructure disclosure)',
    );
    process.exitCode = 1;
  });
}
