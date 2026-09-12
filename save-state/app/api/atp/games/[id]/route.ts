import type { NextRequest } from "next/server";
import { handleRoute, ok } from "@/server/shared/route-handler";
import { parseParams } from "@/server/shared/validation";
import { atpIdParamSchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { getAtpGame, getAtpGameCover } from "@/server/atp/client";
import { mapAtpGameToSnapshot } from "@/server/atp/mapping";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    await getSessionUser(request);
    const { id } = parseParams(atpIdParamSchema, await params);
    const game = await getAtpGame(id);
    // Cover resolves here so the preview shows it immediately; a missing
    // cover degrades to null instead of failing the preview.
    const cover = await getAtpGameCover(id).catch(() => null);
    const snapshot = mapAtpGameToSnapshot(game, cover);
    return ok({
      atpId: game.id,
      name: snapshot.name,
      year: snapshot.releaseDate?.getUTCFullYear() ?? null,
      platforms: snapshot.platforms,
      developers: snapshot.developers,
      publishers: snapshot.publishers,
      genres: snapshot.genres,
      releases: game.releases.map((release) => ({
        platform: release.platform?.name ?? null,
        region: release.region?.name ?? null,
        year: release.releaseDate?.year ?? null,
        version: release.version ?? null,
        edition: release.edition ?? null,
      })),
      externalIdentifiers: game.externalIdentifiers,
      coverUrl: cover?.url ?? null,
    });
  });
}
