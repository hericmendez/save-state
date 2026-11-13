/**
 * Collection Foundation — URL query state (pure, no JSX, no domain imports).
 *
 * The URL is the source of truth for navigable collection state, so that
 * filters and pagination survive refresh, back/forward navigation, sharing
 * and deep linking. Transient input state (e.g. the search field while
 * typing) stays local and is committed to the URL after debounce:
 *
 *   local input → debounce → URL → query
 *
 * No filter semantics live here: status/orderBy/platform/family/year values
 * are parsed as opaque strings/numbers. Fases 3+ (UserGame) and 6-7 (ATP)
 * give them meaning against their respective backends.
 */

export type CollectionViewMode = "grid" | "list";
export type CollectionOrder = "asc" | "desc";

/** Allowed page sizes, shared by the URL parser and the pagination UI. */
export const COLLECTION_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/**
 * Visible page numbers for the pagination control. Shows every page when
 * there are 7 or fewer; otherwise a window around the current page anchored
 * at the first and last pages, collapsing distant ranges with an ellipsis.
 */
export function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort(
    (a, b) => a - b,
  );
  const result: (number | "…")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) result.push("…");
    result.push(page);
    previous = page;
  }
  return result;
}
export interface CollectionQuery {
  search: string;
  platform: string;
  family: string;
  yearFrom: number | undefined;
  yearTo: number | undefined;
  status: string;
  orderBy: string;
  order: CollectionOrder;
  page: number;
  limit: number;
  viewMode: CollectionViewMode;
}

export const COLLECTION_DEFAULTS: CollectionQuery = {
  search: "",
  platform: "",
  family: "",
  yearFrom: undefined,
  yearTo: undefined,
  status: "",
  orderBy: "",
  order: "asc",
  page: 1,
  limit: 20,
  viewMode: "grid",
};

export type CollectionQueryInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined;

function firstValue(
  input: Exclude<CollectionQueryInput, undefined>,
  key: string,
): string | undefined {
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  const value = input[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function cleanString(
  input: Exclude<CollectionQueryInput, undefined>,
  key: string,
): string {
  return (firstValue(input, key) ?? "").trim();
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseYear(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 9999) {
    return undefined;
  }
  return parsed;
}

export function parseViewMode(raw: string | undefined): CollectionViewMode {
  return raw?.trim() === "list" ? "list" : "grid";
}

export function parseCollectionOrder(raw: string | undefined): CollectionOrder {
  return raw?.trim() === "desc" ? "desc" : "asc";
}

/**
 * Parse URL query state. Every invalid value falls back to a predictable
 * default instead of throwing: page → 1, limit outside the allowed sizes →
 * 20, order/viewMode unknown → "asc"/"grid", malformed years → undefined.
 */
export function parseCollectionQuery(
  input: CollectionQueryInput,
): CollectionQuery {
  if (!input) return { ...COLLECTION_DEFAULTS };
  const limit = parsePositiveInt(
    firstValue(input, "limit"),
    COLLECTION_DEFAULTS.limit,
  );
  return {
    search: cleanString(input, "search"),
    platform: cleanString(input, "platform"),
    family: cleanString(input, "family"),
    yearFrom: parseYear(firstValue(input, "yearFrom")),
    yearTo: parseYear(firstValue(input, "yearTo")),
    status: cleanString(input, "status"),
    orderBy: cleanString(input, "orderBy"),
    order: parseCollectionOrder(firstValue(input, "order")),
    page: parsePositiveInt(firstValue(input, "page"), COLLECTION_DEFAULTS.page),
    limit: (
      COLLECTION_PAGE_SIZES as readonly number[]
    ).includes(limit)
      ? limit
      : COLLECTION_DEFAULTS.limit,
    viewMode: parseViewMode(firstValue(input, "viewMode")),
  };
}

/**
 * Serialize collection state back to a query string. Defaults and empty
 * values are omitted so shared links stay clean. Round-trips through
 * {@link parseCollectionQuery}.
 */
export function serializeCollectionQuery(
  query: Partial<CollectionQuery>,
): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value !== "") params.set(key, value);
  };
  set("search", (query.search ?? "").trim());
  set("platform", (query.platform ?? "").trim());
  set("family", (query.family ?? "").trim());
  if (query.yearFrom !== undefined) params.set("yearFrom", String(query.yearFrom));
  if (query.yearTo !== undefined) params.set("yearTo", String(query.yearTo));
  set("status", (query.status ?? "").trim());
  set("orderBy", (query.orderBy ?? "").trim());
  if (query.order !== undefined && query.order !== COLLECTION_DEFAULTS.order) {
    params.set("order", query.order);
  }
  if (query.page !== undefined && query.page !== COLLECTION_DEFAULTS.page) {
    params.set("page", String(query.page));
  }
  if (query.limit !== undefined && query.limit !== COLLECTION_DEFAULTS.limit) {
    params.set("limit", String(query.limit));
  }
  if (
    query.viewMode !== undefined &&
    query.viewMode !== COLLECTION_DEFAULTS.viewMode
  ) {
    params.set("viewMode", query.viewMode);
  }
  return params.toString();
}
