import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { atpIdParamSchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { assertStableAtpIdentity } from "@/server/atp/identity";
import { ownedAtpIds } from "@/server/atp/ownership";
import { getAtpGame, getAtpGameCover } from "@/server/atp/client";
import { mapAtpGameToSnapshot } from "@/server/atp/mapping";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";

export const runtime = "nodejs";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const { id } = parseParams(atpIdParamSchema, await params);
    // Same stability boundary as import and search: an unstable id can
    // never yield an applicable preview (ADR-024 decision F).
    assertStableAtpIdentity(id);
    const game = await getAtpGame(id);
    // Cover resolves here so the preview shows it immediately; a missing
    // cover degrades to null instead of failing the preview.
    const cover = await getAtpGameCover(id).catch(() => null);
    const snapshot = mapAtpGameToSnapshot(game, cover);
    // ADR-024 decision E: warning-only, deterministic duplicate signal.
    // Exact case-insensitive name match against manual GlobalGames; no
    // merge, no dedup, no destructive behavior — the client only displays it.
    await connectDatabase();
    const manualMatch = await GlobalGame.findOne({
      source: "manual",
      name: { $regex: `^${escapeRegExp(snapshot.name)}$`, $options: "i" },
    })
      .select("name")
      .lean();
    // Owned state for the "already in the backlog" UX (same marking as
    // search cards, single lookups, no ATP involvement).
    const owned = await ownedAtpIds(session.id, [id]);
    return ok({
      atpId: game.id,
      name: snapshot.name,
      year: snapshot.releaseDate?.getUTCFullYear() ?? null,
      platforms: snapshot.platforms,
      developers: snapshot.developers,
      publishers: snapshot.publishers,
      genres: snapshot.genres,
      summary: game.description ?? null,
      releases: game.releases.map((release) => ({
        platform: release.platform?.name ?? null,
        region: release.region?.name ?? null,
        year: release.releaseDate?.year ?? null,
        month: release.releaseDate?.month ?? null,
        day: release.releaseDate?.day ?? null,
        precision: release.releaseDate?.precision ?? null,
        version: release.version ?? null,
        edition: release.edition ?? null,
      })),
      externalIdentifiers: game.externalIdentifiers,
      coverUrl: cover?.url ?? null,
      manualDuplicate: manualMatch ? { name: manualMatch.name } : null,
      owned: owned.has(id),
    });
  });
}
