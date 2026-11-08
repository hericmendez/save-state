import "server-only";
import { Types } from "mongoose";
import { connectDatabase } from "@/db/connection";
import { UserGame } from "@/db/models/user-game";
import { GameReview } from "@/db/models/game-review";
import { buildReviewExcerpt } from "@/server/reviews/excerpt";
import { withReviewTransaction } from "@/server/reviews/transaction";

/**
 * Safe, idempotent legacy-review migration (dry-run by default).
 *
 * For every UserGame with a non-empty legacy `review`:
 * - No GameReview → eligible (created only in live mode).
 * - GameReview with identical content + current excerpt → alreadyMigrated.
 * - GameReview with identical content but missing/stale excerpt →
 *   excerptBackfilled (live repairs the single-document field; no body
 *   change, so this is always safe).
 * - GameReview with different content → conflict (NEVER overwrite).
 *
 * C3: live writes are atomic — GameReview.create + reviewExcerpt update
 * commit in ONE transaction per document, so an interruption can only leave
 * (a) nothing (rolled back → still eligible) or (b) both (alreadyMigrated).
 * The backfill path additionally heals partial states left by older runs.
 * Never deletes, never overwrites, never touches production unless the
 * caller explicitly runs `--live --yes` with MONGODB_URI pointed at the
 * intended target.
 */

export interface ReviewMigrationReport {
  scanned: number;
  withLegacyReview: number;
  eligible: number;
  alreadyMigrated: number;
  excerptMissing: number;
  excerptStale: number;
  conflicts: number;
  created: number;
  excerptBackfilled: number;
  errors: number;
  conflictIds: string[];
  errorIds: string[];
}

const CONFLICT_PREVIEW = 12;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

interface Candidate {
  _id: unknown;
  userId?: unknown;
  review?: unknown;
  reviewExcerpt?: unknown;
}

async function loadCandidates(): Promise<Candidate[]> {
  const docs = await UserGame.find({
    review: { $exists: true, $ne: null },
  })
    .select("_id userId review reviewExcerpt")
    .lean()
    .exec();
  return docs as unknown as Candidate[];
}

function legacyOf(raw: Candidate): string {
  return typeof raw.review === "string" ? raw.review.trim() : "";
}

export async function planReviewMigration(): Promise<ReviewMigrationReport> {
  await connectDatabase();
  const candidates = await loadCandidates();

  const report: ReviewMigrationReport = {
    scanned: candidates.length,
    withLegacyReview: 0,
    eligible: 0,
    alreadyMigrated: 0,
    excerptMissing: 0,
    excerptStale: 0,
    conflicts: 0,
    created: 0,
    excerptBackfilled: 0,
    errors: 0,
    conflictIds: [],
    errorIds: [],
  };

  for (const raw of candidates) {
    const legacy = legacyOf(raw);
    if (legacy.length === 0) continue;
    report.withLegacyReview += 1;
    try {
      const existing = await GameReview.findOne({
        userGameId: raw._id as Types.ObjectId,
      })
        .select("content")
        .lean()
        .exec();
      if (!existing) {
        report.eligible += 1;
      } else if ((existing.content ?? "").trim() !== legacy) {
        report.conflicts += 1;
        if (report.conflictIds.length < CONFLICT_PREVIEW)
          report.conflictIds.push(String(raw._id));
      } else {
        // Content matches: check the derived preview health.
        const stored =
          typeof raw.reviewExcerpt === "string" ? raw.reviewExcerpt : "";
        if (stored.length === 0) {
          report.excerptMissing += 1;
        } else if (stored !== buildReviewExcerpt(legacy)) {
          report.excerptStale += 1;
        } else {
          report.alreadyMigrated += 1;
        }
      }
    } catch {
      report.errors += 1;
      if (report.errorIds.length < CONFLICT_PREVIEW)
        report.errorIds.push(String(raw._id));
    }
  }
  return report;
}

export async function runReviewMigrationLive(): Promise<ReviewMigrationReport> {
  await connectDatabase();
  const candidates = await loadCandidates();

  let created = 0;
  let excerptBackfilled = 0;
  const errorIds: string[] = [];

  for (const raw of candidates) {
    const legacy = legacyOf(raw);
    if (legacy.length === 0) continue;
    try {
      const existing = await GameReview.findOne({
        userGameId: raw._id as Types.ObjectId,
      })
        .select("_id content")
        .lean()
        .exec();
      if (!existing) {
        // C3: atomic create — body + excerpt commit together or not at all.
        const excerpt = buildReviewExcerpt(legacy);
        await withReviewTransaction(async (session) => {
          await GameReview.create(
            [
              {
                userGameId: raw._id as Types.ObjectId,
                userId: raw.userId as Types.ObjectId,
                content: legacy,
              },
            ],
            { session },
          );
          await UserGame.updateOne(
            { _id: raw._id as Types.ObjectId },
            { $set: { reviewExcerpt: excerpt } },
            { session },
          );
        });
        created += 1;
        continue;
      }
      if ((existing.content ?? "").trim() !== legacy) {
        continue; // conflict — never touch (counted by the final plan)
      }
      // Content matches: heal missing/stale excerpt (single-document,
      // inherently atomic update; no body change, always safe).
      const expected = buildReviewExcerpt(legacy);
      const stored =
        typeof raw.reviewExcerpt === "string" ? raw.reviewExcerpt : "";
      if (stored !== expected) {
        await UserGame.updateOne(
          { _id: raw._id as Types.ObjectId },
          { $set: { reviewExcerpt: expected } },
        );
        excerptBackfilled += 1;
      }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // M4: concurrent live run won this document. Re-read the winner:
        // a matching body means the work is done (final plan counts it as
        // alreadyMigrated); a divergent body is a conflict (final plan
        // counts it); only a missing winner is a genuine error.
        const winner = await GameReview.findOne({
          userGameId: raw._id as Types.ObjectId,
        })
          .select("_id content")
          .lean()
          .exec();
        if (winner) continue;
      }
      if (errorIds.length < CONFLICT_PREVIEW)
        errorIds.push(String(raw._id));
    }
  }

  // Fresh plan recounts every state (eligible/alreadyMigrated/missing/stale/
  // conflicts) so concurrent winners are classified, never double-counted.
  const fresh = await planReviewMigration();
  return {
    ...fresh,
    created,
    excerptBackfilled,
    errorIds,
    errors: fresh.errors + errorIds.length,
  };
}

export function formatReviewMigrationReport(
  report: ReviewMigrationReport,
  mode: "dry-run" | "live",
): string {
  const lines = [
    `[${mode}] scanned=${report.scanned} withLegacy=${report.withLegacyReview} eligible=${report.eligible} alreadyMigrated=${report.alreadyMigrated} excerptMissing=${report.excerptMissing} excerptStale=${report.excerptStale} conflicts=${report.conflicts} created=${report.created} backfilled=${report.excerptBackfilled} errors=${report.errors}`,
  ];
  if (report.conflictIds.length > 0)
    lines.push(`conflictIds (max ${CONFLICT_PREVIEW} shown): ${report.conflictIds.join(", ")}`);
  if (report.errorIds.length > 0)
    lines.push(`errorIds (max ${CONFLICT_PREVIEW} shown): ${report.errorIds.join(", ")}`);
  return lines.join("\n");
}
