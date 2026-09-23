/**
 * Busca Geral — URL query state (pure, no JSX, ATP-domain).
 *
 * Mirrors the Collection Foundation conventions (URL owns navigable state,
 * defaults omitted from serialized links), but speaks the real BFF
 * contract: q/search, platform, genre, year, developer, publisher and
 * family (mapped onto ATP's platformFamily). Sort/order and year ranges
 * have NO BFF correspondent (documented gaps) and stay out of the URL.
 */

import {
  COLLECTION_PAGE_SIZES,
  parseCollectionOrder,
  parseViewMode,
  type CollectionOrder,
  type CollectionQueryInput,
  type CollectionViewMode,
} from "@/features/collection/collection-query";

export interface AtpSearchQuery {
  search: string;
  platform: string;
  genre: string;
  year: number | undefined;
  developer: string;
  publisher: string;
  family: string;
  page: number;
  limit: number;
  viewMode: CollectionViewMode;
  order: CollectionOrder;
}

export const ATP_SEARCH_DEFAULTS: AtpSearchQuery = {
  search: "",
  platform: "",
  genre: "",
  year: undefined,
  developer: "",
  publisher: "",
  family: "",
  page: 1,
  limit: 20,
  viewMode: "grid",
  order: "asc",
};

function firstString(
  input: Exclude<CollectionQueryInput, undefined>,
  key: string,
): string {
  const raw =
    input instanceof URLSearchParams ? input.get(key) : input[key];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? "").trim();
}

function parsePage(raw: string): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function parseYear(raw: string): number | undefined {
  if (!/^\d{4}$/.test(raw)) return undefined;
  const year = Number(raw);
  return year >= 1950 && year <= 2100 ? year : undefined;
}

/** Invalid values fall back predictably instead of throwing. */
export function parseAtpSearchQuery(
  input: CollectionQueryInput,
): AtpSearchQuery {
  if (!input) return { ...ATP_SEARCH_DEFAULTS };
  const limit = parsePage(firstString(input, "limit") || "20");
  return {
    search: firstString(input, "search").slice(0, 200),
    platform: firstString(input, "platform").slice(0, 100),
    genre: firstString(input, "genre").slice(0, 100),
    year: parseYear(firstString(input, "year")),
    developer: firstString(input, "developer").slice(0, 100),
    publisher: firstString(input, "publisher").slice(0, 100),
    family: firstString(input, "family").slice(0, 100),
    page: parsePage(firstString(input, "page") || "1"),
    limit: (COLLECTION_PAGE_SIZES as readonly number[]).includes(limit)
      ? limit
      : ATP_SEARCH_DEFAULTS.limit,
    viewMode: parseViewMode(firstString(input, "viewMode") || undefined),
    order: parseCollectionOrder(firstString(input, "order") || undefined),
  };
}

/** Serialize, omitting defaults so shared links stay clean. Round-trips. */
export function serializeAtpSearchQuery(query: Partial<AtpSearchQuery>): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value !== "") params.set(key, value);
  };
  set("search", (query.search ?? "").trim());
  set("platform", (query.platform ?? "").trim());
  set("genre", (query.genre ?? "").trim());
  if (query.year !== undefined) params.set("year", String(query.year));
  set("developer", (query.developer ?? "").trim());
  set("publisher", (query.publisher ?? "").trim());
  set("family", (query.family ?? "").trim());
  if (query.page !== undefined && query.page !== ATP_SEARCH_DEFAULTS.page) {
    params.set("page", String(query.page));
  }
  if (query.limit !== undefined && query.limit !== ATP_SEARCH_DEFAULTS.limit) {
    params.set("limit", String(query.limit));
  }
  if (
    query.viewMode !== undefined &&
    query.viewMode !== ATP_SEARCH_DEFAULTS.viewMode
  ) {
    params.set("viewMode", query.viewMode);
  }
  return params.toString();
}

export interface AtpBffParams {
  q?: string;
  platform?: string;
  genre?: string;
  year?: number;
  developer?: string;
  publisher?: string;
  family?: string;
  page: number;
  limit: number;
}

/** Map the URL query onto the real BFF contract (search → q). */
export function toAtpBffParams(query: AtpSearchQuery): AtpBffParams {
  const params: AtpBffParams = { page: query.page, limit: query.limit };
  if (query.search !== "") params.q = query.search;
  if (query.platform !== "") params.platform = query.platform;
  if (query.genre !== "") params.genre = query.genre;
  if (query.year !== undefined) params.year = query.year;
  if (query.developer !== "") params.developer = query.developer;
  if (query.publisher !== "") params.publisher = query.publisher;
  if (query.family !== "") params.family = query.family;
  return params;
}

export function buildAtpBffSearchString(query: AtpSearchQuery): string {
  const bff = toAtpBffParams(query);
  const params = new URLSearchParams({
    page: String(bff.page),
    limit: String(bff.limit),
  });
  // The BFF requires q or at least one filter; callers guarantee a
  // submitted query before fetching.
  if (bff.q !== undefined) params.set("q", bff.q);
  if (bff.platform !== undefined) params.set("platform", bff.platform);
  if (bff.genre !== undefined) params.set("genre", bff.genre);
  if (bff.year !== undefined) params.set("year", String(bff.year));
  if (bff.developer !== undefined) params.set("developer", bff.developer);
  if (bff.publisher !== undefined) params.set("publisher", bff.publisher);
  if (bff.family !== undefined) params.set("family", bff.family);
  return params.toString();
}
/** A submitted search has text or at least one refinement filter. */
export function hasAtpSearch(query: AtpSearchQuery): boolean {
  return (
    query.search !== "" ||
    query.platform !== "" ||
    query.genre !== "" ||
    query.year !== undefined ||
    query.developer !== "" ||
    query.publisher !== "" ||
    query.family !== ""
  );
}

export interface AtpFixedContext {
  platform?: string;
  family?: string;
}

/**
 * Route context prevails: a platform/family detail page locks its value,
 * so a contradictory URL param (e.g. ?platform=nes on the PS5 page) can
 * never escape the page context.
 */
export function applyFixedContext(
  query: AtpSearchQuery,
  fixed: AtpFixedContext,
): AtpSearchQuery {
  return {
    ...query,
    platform: fixed.platform ?? query.platform,
    family: fixed.family ?? query.family,
  };
}

/** Fixed values live in the route, not the query string (no duplication). */
export function serializeWithFixedContext(
  query: AtpSearchQuery,
  fixed: AtpFixedContext,
): string {
  return serializeAtpSearchQuery({
    ...query,
    platform: fixed.platform ? "" : query.platform,
    family: fixed.family ? "" : query.family,
  });
}
