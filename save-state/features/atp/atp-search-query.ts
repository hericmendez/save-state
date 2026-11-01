/**
 * Busca Geral — URL query state (pure, no JSX, ATP-domain).
 *
 * Mirrors the Collection Foundation conventions (URL owns navigable state,
 * defaults omitted from serialized links), speaking the BFF contract:
 * q/search, platform, genre, yearMin/yearMax, developer, publisher,
 * sortBy/order, page, limit, viewMode.
 *
 * Etapa 2 decisions encoded here:
 * - Title is optional: an empty search with filters still fetches; an
 *   empty search WITHOUT filters never fetches (see hasAtpSearch).
 * - Sort: "relevance" is the provider default and is represented by an
 *   absent sortBy (never written to the URL). "title" defaults to ASC,
 *   "year" defaults to DESC (see defaultOrderForSort).
 * - Family has NO free filter in the general search: parseAtpSearchQuery
 *   never reads it from the URL and serializeAtpSearchQuery never writes
 *   it. Family reaches the BFF exclusively as route-locked context
 *   (applyFixedContext on family detail pages).
 */

import {
  COLLECTION_PAGE_SIZES,
  parseCollectionOrder,
  parseViewMode,
  type CollectionOrder,
  type CollectionQueryInput,
  type CollectionViewMode,
} from "@/features/collection/collection-query";

export type AtpSortBy = "relevance" | "title" | "year";

/** Effective default direction per sort (Etapa 2 §3.4). Relevance has no
 *  direction: the provider ranking applies and `order` is ignored. */
export function defaultOrderForSort(
  sortBy: AtpSortBy | undefined,
): CollectionOrder {
  return sortBy === "year" ? "desc" : "asc";
}

export interface AtpSearchQuery {
  search: string;
  platform: string;
  genre: string;
  yearMin: number | undefined;
  yearMax: number | undefined;
  developer: string;
  publisher: string;
  family: string;
  sortBy: AtpSortBy | undefined;
  page: number;
  limit: number;
  viewMode: CollectionViewMode;
  order: CollectionOrder;
}

export const ATP_SEARCH_DEFAULTS: AtpSearchQuery = {
  search: "",
  platform: "",
  genre: "",
  yearMin: undefined,
  yearMax: undefined,
  developer: "",
  publisher: "",
  family: "",
  sortBy: undefined,
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

/** Parse a free-text year bound (empty/invalid → undefined, no throw). */
export function parseYearBound(raw: string): number | undefined {
  return parseYear(raw.trim());
}

/** Invalid values fall back predictably instead of throwing. */
export function parseAtpSearchQuery(
  input: CollectionQueryInput,
): AtpSearchQuery {
  if (!input) return { ...ATP_SEARCH_DEFAULTS };
  const limit = parsePage(firstString(input, "limit") || "20");
  // Deprecated single-year alias: maps to both bounds when the range is
  // absent, so old shared links keep working.
  const legacyYear = parseYear(firstString(input, "year"));
  const yearMin = parseYear(firstString(input, "yearMin")) ?? legacyYear;
  const yearMax = parseYear(firstString(input, "yearMax")) ?? legacyYear;
  const sortRaw = firstString(input, "sortBy");
  // "relevance" (explicit or absent) is the provider default: represented
  // by an absent sortBy so it never leaks into serialized links.
  const sortBy: AtpSearchQuery["sortBy"] =
    sortRaw === "title" || sortRaw === "year" ? sortRaw : undefined;
  return {
    search: firstString(input, "search").slice(0, 200),
    platform: firstString(input, "platform").slice(0, 100),
    genre: firstString(input, "genre").slice(0, 100),
    yearMin,
    yearMax,
    developer: firstString(input, "developer").slice(0, 100),
    publisher: firstString(input, "publisher").slice(0, 100),
    // Etapa 2 §3.6: no free family filter in the general search. Family
    // arrives only via applyFixedContext (family detail pages); a `family`
    // URL param here would bypass the route lock, so it is ignored.
    family: "",
    sortBy,
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
  if (query.yearMin !== undefined) params.set("yearMin", String(query.yearMin));
  if (query.yearMax !== undefined) params.set("yearMax", String(query.yearMax));
  set("developer", (query.developer ?? "").trim());
  set("publisher", (query.publisher ?? "").trim());
  // Family is route context, never a free URL param (Etapa 2 §3.6): it is
  // injected by applyFixedContext and sent to the BFF, but shared links
  // stay clean of it.
  if (query.sortBy !== undefined) params.set("sortBy", query.sortBy);
  // Direction only matters with an explicit title/year sort.
  if (query.sortBy !== undefined && query.order !== undefined) {
    params.set("order", query.order);
  }
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
  yearMin?: number;
  yearMax?: number;
  developer?: string;
  publisher?: string;
  family?: string;
  sortBy?: AtpSortBy;
  order?: CollectionOrder;
  page: number;
  limit: number;
}

/** Map the URL query onto the real BFF contract (search → q). */
export function toAtpBffParams(query: AtpSearchQuery): AtpBffParams {
  const params: AtpBffParams = { page: query.page, limit: query.limit };
  if (query.search !== "") params.q = query.search;
  if (query.platform !== "") params.platform = query.platform;
  if (query.genre !== "") params.genre = query.genre;
  if (query.yearMin !== undefined) params.yearMin = query.yearMin;
  if (query.yearMax !== undefined) params.yearMax = query.yearMax;
  if (query.developer !== "") params.developer = query.developer;
  if (query.publisher !== "") params.publisher = query.publisher;
  if (query.family !== "") params.family = query.family;
  if (query.sortBy !== undefined) params.sortBy = query.sortBy;
  if (query.sortBy !== undefined && query.order !== undefined) {
    params.order = query.order;
  }
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
  if (bff.yearMin !== undefined) params.set("yearMin", String(bff.yearMin));
  if (bff.yearMax !== undefined) params.set("yearMax", String(bff.yearMax));
  if (bff.developer !== undefined) params.set("developer", bff.developer);
  if (bff.publisher !== undefined) params.set("publisher", bff.publisher);
  if (bff.family !== undefined) params.set("family", bff.family);
  if (bff.sortBy !== undefined) params.set("sortBy", bff.sortBy);
  if (bff.order !== undefined) params.set("order", bff.order);
  return params.toString();
}
/** A submitted search has text or at least one refinement filter.
 *  Sorting alone never triggers a fetch (nothing to order yet). */
export function hasAtpSearch(query: AtpSearchQuery): boolean {
  return (
    query.search !== "" ||
    query.platform !== "" ||
    query.genre !== "" ||
    query.yearMin !== undefined ||
    query.yearMax !== undefined ||
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

/** Fixed values live in the route, not the query string (no duplication).
 *  Family detail pages lock the family; platform detail pages lock the
 *  platform. Only the platform lock needs URL stripping here — family is
 *  never serialized (see serializeAtpSearchQuery). */
export function serializeWithFixedContext(
  query: AtpSearchQuery,
  fixed: AtpFixedContext,
): string {
  return serializeAtpSearchQuery({
    ...query,
    platform: fixed.platform ? "" : query.platform,
    family: "",
  });
}
