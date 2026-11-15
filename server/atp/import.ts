/**
 * ATP import operation. Writes ONLY to Save State collections:
 * a GlobalGame snapshot (source "atp" + atpDomainId) plus a UserGame via
 * the existing creation path (duplicate + race semantics preserved).
 * ATP is never mutated by this module.
 */

import "server-only";
import slugify from "slugify";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import {
  GlobalGame,
  type GlobalGameDocument,
} from "@/db/models/global-game";
import {
  createGame,
  type UserGameWithGame,
} from "@/server/games/service";
import {
  getAtpGame,
  getAtpGameCover,
} from "@/server/atp/client";
import { mapAtpGameToSnapshot } from "@/server/atp/mapping";
import { assertStableAtpIdentity } from "@/server/atp/identity";
import type { AtpImportInput } from "@/schemas/atp";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

async function findOrCreateSnapshotGlobalGame(
  atpId: string,
): Promise<GlobalGameDocument> {
  await connectDatabase();
  const existing = await GlobalGame.findOne({ atpDomainId: atpId });
  if (existing) return existing;

  const game = await getAtpGame(atpId);
  // Snapshot the currently selected cover (no re-resolution, no sync).
  const cover = await getAtpGameCover(atpId).catch(() => null);
  const snapshot = mapAtpGameToSnapshot(game, cover);

  try {
    return await GlobalGame.create({
      slug: `${slugify(snapshot.name, { lower: true, strict: true })}-${Date.now()}`,
      ...snapshot,
    });
  } catch (error) {
    // Concurrent import raced on the sparse unique atpDomainId index;
    // the database remains authoritative over the pre-check above.
    if (isDuplicateKeyError(error)) {
      const winner = await GlobalGame.findOne({ atpDomainId: atpId });
      if (winner) return winner;
    }
    throw error;
  }
}

export async function importAtpGame(
  userId: string,
  input: AtpImportInput,
): Promise<UserGameWithGame> {
  // ADR-024 decision F: quarantine non-durable ATP identities before any
  // database lookup or ATP call — fail fast, no durable reference created.
  assertStableAtpIdentity(input.atpId);
  const globalGame = await findOrCreateSnapshotGlobalGame(input.atpId);
  if (globalGame.source !== "atp") {
    // Defensive: an atpDomainId must never alias a manual record.
    throw new ApiError(
      "INTERNAL_ERROR",
      "ATP identity collision with a manual game",
      500,
    );
  }
  return createGame({
    userId,
    gameId: String(globalGame._id),
    ...(input.personal ?? {}),
  });
}
