import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { searchAtpGames } from "@/server/atp/client";
import { toAtpSearchCard } from "@/server/atp/cards";
import { isStableAtpIdentity } from "@/server/atp/identity";
import { ownedAtpIds } from "@/server/atp/ownership";
import { CatalogSearch } from "@/features/atp/catalog-search";
import {
  hasAtpSearch,
  parseAtpSearchQuery,
  toAtpBffParams,
} from "@/features/atp/atp-search-query";
import type { AtpSearchPage } from "@/features/atp/atp-result";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog");
  }

  // URL-driven deep links render server-side through the same BFF path the
  // client uses — never an internal HTTP call to our own API.
  const initialQuery = parseAtpSearchQuery(await searchParams);
  let initialPage: AtpSearchPage | null = null;
  let initialError: { message: string; status: number | null } | null = null;
  if (hasAtpSearch(initialQuery)) {
    const bff = toAtpBffParams(initialQuery);
    try {
      const result = await searchAtpGames({
        q: bff.q ?? "",
        page: bff.page,
        limit: bff.limit,
        platform: bff.platform,
        genre: bff.genre,
        year: bff.year,
        developer: bff.developer,
        publisher: bff.publisher,
        family: bff.family,
      });
      const cards = result.data
        .filter((game) => isStableAtpIdentity(game.id))
        .map(toAtpSearchCard);
      const owned = await ownedAtpIds(
        session.id,
        cards.map((card) => card.atpId),
      );
      const { page, limit, total, totalPages } = result.pagination;
      initialPage = {
        data: cards.map((card) => ({
          ...card,
          owned: owned.has(card.atpId),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } catch (err) {
      initialError =
        err instanceof ApiError
          ? { message: err.message, status: err.status }
          : { message: "Falha na busca", status: null };
    }
  }

  return (
    <CatalogSearch
      initialQuery={initialQuery}
      initialPage={initialPage}
      initialError={initialError}
    />
  );
}
