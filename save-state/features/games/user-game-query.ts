/**
 * Minha Biblioteca — domain query bridge (pure, server-safe).
 *
 * Connects the Collection Foundation URL state to the UserGame service:
 *
 *   URL/searchParams → CollectionQuery → service filters → listGames
 *
 * View-fixed params (favorite / withoutList / listId) are NOT part of the
 * URL: the route itself defines the view (/backlog, /backlog/favoritos,
 * /backlog/without-list, /backlog/lists/:listId), so duplicating them in the
 * query string would add no value.
 */

import {
  parseCollectionQuery,
  type CollectionQuery,
  type CollectionQueryInput,
} from "@/features/collection/collection-query";
import type { ListGamesQuery } from "@/schemas/games";

export type { CollectionQuery };

/** Service-ready subset: type-only schema import, so no zod runtime cost. */
export type LibraryServiceFilters = Pick<
  ListGamesQuery,
  | "search"
  | "platform"
  | "status"
  | "yearFrom"
  | "yearTo"
  | "orderBy"
  | "order"
  | "page"
  | "limit"
>;

export function parseLibrarySearchParams(
  input: CollectionQueryInput,
): CollectionQuery {
  return parseCollectionQuery(input);
}

/** Drop empty/opaque values; the service treats absence as "no filter". */
export function hasActiveLibraryFilters(query: CollectionQuery): boolean {
  return (
    query.search !== "" ||
    query.platform !== "" ||
    query.status !== "" ||
    query.yearFrom !== undefined ||
    query.yearTo !== undefined
  );
}export function toLibraryServiceFilters(
  query: CollectionQuery,
): LibraryServiceFilters {
  const filters: LibraryServiceFilters = {
    page: query.page,
    limit: query.limit,
  };
  if (query.search !== "") filters.search = query.search;
  if (query.platform !== "") filters.platform = query.platform;
  if (query.status !== "") {
    filters.status = query.status as ListGamesQuery["status"];
  }
  if (query.yearFrom !== undefined) filters.yearFrom = query.yearFrom;
  if (query.yearTo !== undefined) filters.yearTo = query.yearTo;
  if (query.orderBy !== "") {
    filters.orderBy = query.orderBy as ListGamesQuery["orderBy"];
    filters.order = query.order;
  }
  return filters;
}
