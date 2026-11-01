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

  // URL-driven deep links render server-side through the same
  // provider-backed reads the client uses — never an internal HTTP call
  // to our own API.
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
