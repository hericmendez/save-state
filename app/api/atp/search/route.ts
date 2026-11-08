import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/server/shared/route-handler";
import {
  parseQuery,
  searchParamsToObject,
} from "@/server/shared/validation";
import { atpSearchQuerySchema } from "@/schemas/atp";
import { getSessionUser } from "@/server/auth/session";
import { searchAtpGames } from "@/server/atp/client";
import { toAtpSearchCard } from "@/server/atp/cards";
import { isStableAtpIdentity } from "@/server/atp/identity";
import { ownedAtpIds } from "@/server/atp/ownership";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionUser(request);
    const query = parseQuery(
      atpSearchQuerySchema,
      searchParamsToObject(request.nextUrl.searchParams),
    );
    const result = await searchAtpGames(query);
    // Covers resolve lazily per card via /api/atp/games/:id/cover —
    // never fanned out here (ADR-023).
    // Unstable ATP identities (atp-unknown-*, admin-*) are never
    // selectable catalog references (ADR-024 decision F): they carry
    // empty or garbage metadata, so listing them only produces dead
    // previews and empty form patches. Filter them here, at the same
    // boundary that quarantines them on import.
    const cards = result.data
      .filter((game) => isStableAtpIdentity(game.id))
      .map(toAtpSearchCard);
    // Ownership is display state resolved in two queries (no N+1), so
    // cards can offer "Adicionar ao Backlog" or "No backlog" honestly.
    const owned = await ownedAtpIds(
      session.id,
      cards.map((card) => card.atpId),
    );
    // The ATP envelope carries no hasNext/hasPrevious flags; derive them
    // here so every client shares one paging contract.
    const { page, limit, total, totalPages } = result.pagination;
    return NextResponse.json(
      {
        data: cards.map((card) => ({ ...card, owned: owned.has(card.atpId) })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      { status: 200 },
    );
  });
}
