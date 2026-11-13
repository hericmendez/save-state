import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { searchCatalogPage } from "@/server/search/catalog-reads";
import { CatalogSearch } from "@/features/atp/catalog-search";
import {
  hasAtpSearch,
  parseAtpSearchQuery,
  toAtpBffParams,
} from "@/features/atp/atp-search-query";
import type { AtpSearchPage } from "@/features/atp/atp-result";

/**
 * Busca Geral — general catalog search.
 *
 * Reuses the exact same provider-neutral reads (`searchCatalogPage`) and
 * the same `CatalogSearch` UI as `/catalog`: no duplicated IGDB/ATP
 * integration, no new BFF contract. `/catalog` keeps working unchanged
 * (directories + browsing); `/search` is the Home search entry point.
 * Server Component reads directly — never via internal HTTP.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/search");
  }

  const initialQuery = parseAtpSearchQuery(await searchParams);
  let initialPage: AtpSearchPage | null = null;
  let initialError: { message: string; status: number | null } | null = null;
  if (hasAtpSearch(initialQuery)) {
    const bff = toAtpBffParams(initialQuery);
    try {
      const result = await searchCatalogPage(
        {
          q: bff.q ?? "",
          page: bff.page,
          limit: bff.limit,
          platform: bff.platform,
          genre: bff.genre,
          yearMin: bff.yearMin,
          yearMax: bff.yearMax,
          developer: bff.developer,
          publisher: bff.publisher,
          family: bff.family,
          initial: bff.initial,
          sortBy: bff.sortBy,
          order: bff.order,
        },
        session.id,
      );
      initialPage = result;
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
