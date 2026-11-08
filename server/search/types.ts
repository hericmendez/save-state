/**
 * Engine-agnostic search contract (Etapa 2).
 *
 * Save State owns this contract. Providers (ATP, IGDB) implement it;
 * the UI and Route Handlers consume only these neutral shapes and never
 * know which provider served the request.
 *
 * Catalog organization (platforms, families, generations) belongs to
 * Save State. Providers receive Save State filter values opaquely and
 * translate them to their own APIs internally.
 */

import type { CatalogInitial } from "@/features/atp/atp-search-query";

export type SearchProviderName = "IGDB" | "ATP";

export interface SearchQueryParams {
  q: string;
  page: number;
  limit: number;
  platform?: string;
  /**
   * Explicit, pre-validated IGDB platform ids (Parte B). Internal typed
   * contract: set only from fixed editorial context
   * (`resolveEditorialIgdbIds`), never parsed from the public page URL.
   * The BFF accepts them as a validated comma-separated list. Unioned
   * with name-resolved ids in the provider — the name filter is
   * preserved, never replaced.
   */
  platformIds?: number[];
  genre?: string;
  /** Inclusive release-year interval; each bound optional. */
  yearMin?: number;
  yearMax?: number;
  developer?: string;
  publisher?: string;
  family?: string;
  /**
   * Índice alfanumérico (Todos = ausente). Traduzido por cada provider
   * para filtragem server-side sobre o universo completo — nunca sobre
   * a página recebida. Semântica em features/atp/atp-search-query.ts.
   */
  initial?: CatalogInitial;
  /** Absent (or "relevance") = provider default order. Only title/year
   *  are server-sortable; other dimensions have no IGDB-native ordering. */
  sortBy?: "relevance" | "title" | "year";
  /** Applies only to an explicit title/year sort (defaults: title ASC,
   *  year DESC). Ignored for relevance/default ordering. */
  order?: "asc" | "desc";
  discover?: boolean;
}

export interface SearchPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Neutral card. `id` is the provider's external id (opaque to the UI).
 * `coverUrl` is present when the provider already returns it with the
 * search payload (IGDB `cover.image_id`); absent means "resolve on
 * demand" via the cover endpoint (ATP list responses carry no cover).
 */
export interface SearchCard {
  id: string;
  name: string;
  year: number | null;
  platforms: string[];
  genres: string[];
  coverUrl?: string | null;
}

export interface SearchPage {
  data: SearchCard[];
  pagination: SearchPagination;
}

export interface SearchPreviewRelease {
  platform: string | null;
  region: string | null;
  year: number | null;
  month?: number | null;
  day?: number | null;
  precision?: string | null;
  version: string | null;
  edition: string | null;
}

export interface SearchPreview {
  id: string;
  name: string;
  year: number | null;
  platforms: string[];
  developers: string[];
  publishers: string[];
  genres: string[];
  summary: string | null;
  releases: SearchPreviewRelease[];
  externalIdentifiers: Array<{ source: string; id: string }>;
  coverUrl: string | null;
  manualDuplicate: { name: string } | null;
  owned: boolean;
}

export interface SearchCover {
  url: string;
  width: number | null;
  height: number | null;
  source: string | null;
}

export interface SearchPlatform {
  id: string;
  name: string;
  company: string;
  releaseYear?: number | null;
  status: string;
  family?: string | null;
  type?: string | null;
  generation?: number | null;
  thumb: { logo: string | null; image: string | null } | null;
  gameCount: number;
  /** Save State name variants that resolve to this platform (match hints for editorial mappings). */
  aliases?: string[];
}

export interface SearchPlatformList {
  data: SearchPlatform[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface SearchPlatformListParams {
  companyName?: string;
  platformStatus?: string;
  releaseYear?: number;
  showEmptyPlatforms?: boolean;
  page: number;
  limit: number;
  sort?: "name" | "releaseYear" | "gameCount";
  order?: "asc" | "desc";
}

export interface SearchFamily {
  name: string;
  platforms: SearchPlatform[];
  platformCount: number;
  gameCount: number;
}

export interface SearchProvider {
  readonly providerName: SearchProviderName;
  searchGames(params: SearchQueryParams, source?: Record<string, string | undefined>): Promise<SearchPage>;
  getGameDetail(id: string, source?: Record<string, string | undefined>): Promise<Omit<SearchPreview, "manualDuplicate" | "owned">>;
  getGameCover(id: string, source?: Record<string, string | undefined>): Promise<SearchCover | null>;
  searchCovers(params: { q: string; limit: number }, source?: Record<string, string | undefined>): Promise<SearchCover[]>;
  listPlatforms(params: SearchPlatformListParams, source?: Record<string, string | undefined>): Promise<SearchPlatformList>;
  getPlatform(id: string, source?: Record<string, string | undefined>): Promise<SearchPlatform>;
  listFamilies(source?: Record<string, string | undefined>): Promise<SearchFamily[]>;
}
