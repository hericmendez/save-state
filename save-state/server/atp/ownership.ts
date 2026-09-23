/**
 * ATP ownership marking (Save State side, read-only).
 *
 * Answers "is this ATP game already in the user's backlog?" without
 * touching ATP: GlobalGame.atpDomainId → GlobalGame → UserGame(userId).
 * Batched in two queries regardless of card count (no N+1): ownership is
 * display state, resolved at the BFF boundary that already owns the cards.
 */

import "server-only";
import { Types } from "mongoose";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";

export async function ownedAtpIds(
  userId: string,
  atpIds: string[],
): Promise<Set<string>> {
  if (atpIds.length === 0) return new Set();
  await connectDatabase();
  const globals = await GlobalGame.find({
    atpDomainId: { $in: atpIds },
  })
    .select("_id atpDomainId")
    .lean();
  if (globals.length === 0) return new Set();
  const atpByGlobalId = new Map(
    globals.map((entry) => [String(entry._id), entry.atpDomainId as string]),
  );
  const memberships = await UserGame.find({
    userId: new Types.ObjectId(userId),
    gameId: { $in: [...atpByGlobalId.keys()].map((id) => new Types.ObjectId(id)) },
  })
    .select("gameId")
    .lean();
  const owned = new Set<string>();
  for (const membership of memberships) {
    const atpId = atpByGlobalId.get(String(membership.gameId));
    if (atpId !== undefined) owned.add(atpId);
  }
  return owned;
}
