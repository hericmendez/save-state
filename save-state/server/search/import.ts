/**
 * Neutral external import (Etapa 4).
 *
 * IGDB → GlobalGame → UserGame, mirroring the ATP import operation:
 * - Identity is the provider's external id (igdbId numeric for IGDB).
 *   An ATP-shaped id never resolves as IGDB and vice versa.
 * - Existing snapshots are reused as-is: incomplete provider responses
 *   never overwrite stored metadata, and name similarity alone never
 *   merges records.
 * - UserGame creation always goes through createGame (duplicate + race
 *   semantics preserved, no duplicated business rules).
 */

import "server-only";
import slugify from "slugify";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import {
  GlobalGame,
  type GlobalGameDocument,
} from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import {
  createGame,
  type UserGameWithGame,
} from "@/server/games/service";
import { assertStableAtpIdentity } from "@/server/atp/identity";
import { importAtpGame } from "@/server/atp/import";
import { getSearchProvider } from "@/server/search/service";
import type { SearchImportInput } from "@/schemas/search";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

function parseIgdbId(externalId: string): number {
  if (!/^[0-9]{1,10}$/.test(externalId)) {
    throw new ApiError("IGDB_GAME_NOT_FOUND", "Game not found", 404);
  }
  const numeric = Number(externalId);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new ApiError("IGDB_GAME_NOT_FOUND", "Game not found", 404);
  }
  return numeric;
}

async function findOrCreateSnapshotIgdbGame(
  igdbId: number,
  source?: Record<string, string | undefined>,
  opts?: { rejectExisting?: boolean },
): Promise<GlobalGameDocument> {
  await connectDatabase();
  const existing = await GlobalGame.findOne({ igdbId });
  // Reuse as-is: stored metadata is never refreshed from a possibly
  // incomplete provider response.
  if (existing) {
    if (opts?.rejectExisting) {
      throw new ApiError(
        "GAME_ALREADY_CATALOGED",
        "This game is already in the catalog",
        409,
      );
    }
    return existing;
  }

  const provider = getSearchProvider(source);
  if (provider.providerName !== "IGDB") {
    throw new ApiError("INTERNAL_ERROR", "Provider mismatch on IGDB import", 500);
  }
  const detail = await provider.getGameDetail(String(igdbId), source);
  const snapshot = {
    name: detail.name,
    source: "igdb" as const,
    igdbId,
    ...(detail.coverUrl ? { cover: detail.coverUrl } : {}),
    genres: detail.genres,
    platforms: detail.platforms,
    developers: detail.developers,
    publishers: detail.publishers,
    ...(typeof detail.year === "number"
      ? { releaseDate: new Date(Date.UTC(detail.year, 0, 1)) }
      : {}),
    ...(detail.summary ? { summary: detail.summary } : {}),
  };

  try {
    return await GlobalGame.create({
      slug: `${slugify(snapshot.name, { lower: true, strict: true })}-${Date.now()}`,
      ...snapshot,
    });
  } catch (error) {
    // Concurrent import raced on the sparse unique igdbId index;
    // the database remains authoritative over the pre-check above.
    if (isDuplicateKeyError(error)) {
      if (opts?.rejectExisting) {
        // Restrictive mode: the loser must not silently reuse the winner.
        throw new ApiError(
          "GAME_ALREADY_CATALOGED",
          "This game is already in the catalog",
          409,
        );
      }
      const winner = await GlobalGame.findOne({ igdbId });
      if (winner) return winner;
    }
    throw error;
  }
}

export async function importExternalGame(
  userId: string,
  input: SearchImportInput,
  source?: Record<string, string | undefined>,
): Promise<UserGameWithGame> {
  const provider = getSearchProvider(source);
  if (provider.providerName === "ATP") {
    // Same stability boundary as the legacy ATP route; atpDomainId flow
    // and duplicate/race semantics preserved via importAtpGame.
    assertStableAtpIdentity(input.externalId);
    return importAtpGame(userId, {
      atpId: input.externalId,
      ...(input.personal ? { personal: input.personal } : {}),
    });
  }
  const igdbId = parseIgdbId(input.externalId);
  const restrictive = input.conflictPolicy === "reject-existing";
  if (restrictive) {
    // "Edit and add" policy: pre-existing records are conflicts, never
    // silent reuses. Library membership wins over catalog presence.
    await connectDatabase();
    const existing = await GlobalGame.findOne({ igdbId });
    if (existing) {
      if (existing.source !== "igdb") {
        throw new ApiError(
          "GAME_CATALOG_CONFLICT",
          "This external id belongs to a catalog record from another origin",
          409,
        );
      }
      const owned = await UserGame.findOne({
        userId,
        gameId: existing._id,
      })
        .select("_id")
        .lean();
      if (owned) {
        throw new ApiError(
          "GAME_ALREADY_IN_LIBRARY",
          "This game is already in your library",
          400,
        );
      }
      throw new ApiError(
        "GAME_ALREADY_CATALOGED",
        "This game is already in the catalog",
        409,
      );
    }
  }
  const globalGame = await findOrCreateSnapshotIgdbGame(
    igdbId,
    source,
    restrictive ? { rejectExisting: true } : undefined,
  );
  if (globalGame.source !== "igdb") {
    // Defensive: an igdbId must never alias a non-IGDB record (the approved
    // model forbids manual records carrying igdbId).
    throw new ApiError(
      "GAME_CATALOG_CONFLICT",
      "This external id belongs to a catalog record from another origin",
      409,
    );
  }
  return createGame({
    userId,
    gameId: String(globalGame._id),
    ...(input.personal ?? {}),
  });
}
