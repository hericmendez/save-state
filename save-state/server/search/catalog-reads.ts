/**
 * Shared catalog reads (Etapa 3).
 *
 * Single implementation of the provider-backed reads consumed by BOTH
 * the neutral /api/search/* routes and the catalog Server Components.
 * Server Components must call these (never the provider directly, never
 * HTTP to our own routes).
 */

import "server-only";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { GlobalGame } from "@/db/models/global-game";
import { ownedExternalIds } from "@/server/search/ownership";
import { getSearchProvider } from "@/server/search/service";
import type {
  SearchFamily,
  SearchPage,
  SearchPlatform,
  SearchPlatformList,
  SearchPlatformListParams,
  SearchPreview,
  SearchQueryParams,
} from "@/server/search/types";

export type CatalogCard = SearchPage["data"][number] & {
  owned: boolean;
  /**
   * Transitional alias carrying the active provider's external id under
   * the legacy Atp* field name. The VALUE is always correct per provider
   * (never an ATP id mistaken for IGDB or vice versa); the NAME is debt
   * removed with the Atp* type rename. Owned IGDB cards do not exist
   * yet (Etapa 4), so the by-atp bridge never receives an IGDB id.
   */
  atpId: string;
};

/** True for any "catalog temporarily unavailable" failure, any provider. */
export function isCatalogUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "ATP_UNAVAILABLE" || error.code === "IGDB_UNAVAILABLE")
  );
}

export async function searchCatalogPage(
  params: SearchQueryParams,
  userId: string,
  source?: Record<string, string | undefined>,
): Promise<{ data: CatalogCard[]; pagination: SearchPage["pagination"] }> {
  const provider = getSearchProvider(source);
  const result = await provider.searchGames(params, source);
  // Ownership is Save State display state resolved through the active
  // provider's identity (ownedExternalIds); IGDB cards owned by the user
  // resolve via igdbId → GlobalGame → UserGame.
  const owned = await ownedExternalIds(
    userId,
    result.data.map((card) => card.id),
    source,
  );
  return {
    data: result.data.map((card) => ({
      ...card,
      owned: owned.has(card.id),
      atpId: card.id,
    })),
    pagination: result.pagination,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getCatalogDetail(
  id: string,
  userId: string,
  source?: Record<string, string | undefined>,
): Promise<SearchPreview & { atpId?: string }> {
  const provider = getSearchProvider(source);
  const detail = await provider.getGameDetail(id, source);
  await connectDatabase();
  const manualMatch = await GlobalGame.findOne({
    source: "manual",
    name: { $regex: `^${escapeRegExp(detail.name)}$`, $options: "i" },
  })
    .select("name")
    .lean();
    const owned = await ownedExternalIds(userId, [id], source);
    return {
      ...detail,
      manualDuplicate: manualMatch ? { name: manualMatch.name } : null,
      owned: owned.has(id),
      atpId: detail.id,
    };
}

export async function listCatalogPlatforms(
  params: SearchPlatformListParams,
  source?: Record<string, string | undefined>,
): Promise<SearchPlatformList> {
  return getSearchProvider(source).listPlatforms(params, source);
}

export async function getCatalogPlatform(
  id: string,
  source?: Record<string, string | undefined>,
): Promise<SearchPlatform> {
  return getSearchProvider(source).getPlatform(id, source);
}

export async function listCatalogFamilies(
  source?: Record<string, string | undefined>,
): Promise<SearchFamily[]> {
  return getSearchProvider(source).listFamilies(source);
}

/** Bounded fetch of every catalog platform (consoles enrichment). */
export async function getAllCatalogPlatforms(
  source?: Record<string, string | undefined>,
): Promise<SearchPlatform[]> {
  const provider = getSearchProvider(source);
  const first = await provider.listPlatforms(
    { page: 1, limit: 100, showEmptyPlatforms: true },
    source,
  );
  const platforms = [...first.data];
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const next = await provider.listPlatforms(
      { page, limit: 100, showEmptyPlatforms: true },
      source,
    );
    platforms.push(...next.data);
  }
  return platforms;
}
