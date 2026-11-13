/**
 * Neutral ownership resolution (Etapa 4).
 *
 * Save State-side display state: GlobalGame external identity →
 * GlobalGame → UserGame(userId). Two queries, no N+1, no provider calls.
 * The identity field follows the ACTIVE provider: atpDomainId for ATP,
 * igdbId for IGDB. This module is the only place (besides the legacy
 * server/atp/ownership) allowed to map external ids to library state.
 */

import "server-only";
import { Types } from "mongoose";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { ownedAtpIds } from "@/server/atp/ownership";
import { getSearchProviderName } from "@/server/search/service";

function parseIgdbId(value: string): number | undefined {
  if (!/^[0-9]{1,10}$/.test(value)) return undefined;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}

export async function ownedExternalIds(
  userId: string,
  externalIds: string[],
  source?: Record<string, string | undefined>,
): Promise<Set<string>> {
  if (getSearchProviderName(source) === "ATP") {
    return ownedAtpIds(userId, externalIds);
  }
  const numericByRaw = new Map<string, number>();
  for (const raw of externalIds) {
    const numeric = parseIgdbId(raw);
    if (numeric !== undefined && !numericByRaw.has(raw)) {
      numericByRaw.set(raw, numeric);
    }
  }
  if (numericByRaw.size === 0) return new Set<string>();
  await connectDatabase();
  const globals = await GlobalGame.find({
    igdbId: { $in: [...numericByRaw.values()] },
  })
    .select("_id igdbId")
    .lean();
  const globalIdByIgdb = new Map(
    globals.map((entry) => [entry.igdbId as number, String(entry._id)]),
  );
  const userGames = await UserGame.find({
    userId: new Types.ObjectId(userId),
    gameId: { $in: [...globalIdByIgdb.values()] },
  })
    .select("gameId")
    .lean();
  const ownedGlobalIds = new Set(userGames.map((game) => String(game.gameId)));
  const owned = new Set<string>();
  for (const [raw, numeric] of numericByRaw) {
    const globalId = globalIdByIgdb.get(numeric);
    if (globalId && ownedGlobalIds.has(globalId)) owned.add(raw);
  }
  return owned;
}
