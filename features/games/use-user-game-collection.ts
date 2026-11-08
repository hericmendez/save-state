"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import {
  parseCollectionQuery,
  serializeCollectionQuery,
  type CollectionQuery,
} from "@/features/collection/collection-query";
import { useDebouncedValue } from "@/features/collection/use-debounced-value";
import type {
  Game,
  PaginatedResponse,
  Pagination,
} from "@/features/shared/types";
import { toPlainGame } from "./mappers";
import { toLibraryServiceFilters } from "./user-game-query";
import {
  toFilterDraft,
  type LibraryFilterDraft,
} from "./user-game-filters";

export interface CollectionScope {
  favorite?: boolean;
  withoutCollection?: boolean;
  collectionId?: string;
}

/**
 * Minha Biblioteca — domain orchestrator state (UserGame only).
 *
 * The URL owns the navigable query; the search field stays local until it
 * settles (debounce), then commits to the URL; the committed query drives
 * a single server-side fetch with stale-request cancellation. No Zustand,
 * no global cache: edit/delete/favorite flows call refresh().
 */
export function useUserGameCollection({
  initialQuery,
  initialGames,
  initialPagination,
  scope,
}: {
  initialQuery: CollectionQuery;
  initialGames: Game[];
  initialPagination: Pagination;
  scope: CollectionScope;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState<CollectionQuery>(initialQuery);
  const [searchInput, setSearchInput] = useState(initialQuery.search);
  const [games, setGames] = useState<Game[]>(initialGames);
  const [pagination, setPagination] = useState<Pagination | null>(
    initialPagination,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const queryRef = useRef(query);
  queryRef.current = query;
  const abortRef = useRef<AbortController | null>(null);
  const firstLoad = useRef(true);

  const debouncedSearch = useDebouncedValue(searchInput.trim());

  const commitToUrl = useCallback(
    (next: CollectionQuery) => {
      const serialized = serializeCollectionQuery(next);
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname],
  );

  // Filter/search commits: apply locally, reset to page 1 when the result
  // set may have changed, and mirror to the URL.
  const updateQuery = useCallback(
    (patch: Partial<CollectionQuery>, resetPage = true) => {
      setQuery((current) => {
        const next: CollectionQuery = {
          ...current,
          ...patch,
          page: resetPage ? 1 : (patch.page ?? current.page),
        };
        setSearchInput(next.search);
        commitToUrl(next);
        return next;
      });
    },
    [commitToUrl],
  );

  const updateFilters = useCallback(
    (patch: Partial<LibraryFilterDraft>) => {
      const draft = { ...toFilterDraft(queryRef.current), ...patch };
      const yearFrom = draft.yearFrom.trim();
      const yearTo = draft.yearTo.trim();
      updateQuery({
        platform: draft.platform.trim(),
        yearFrom: /^\d{4}$/.test(yearFrom) ? Number(yearFrom) : undefined,
        yearTo: /^\d{4}$/.test(yearTo) ? Number(yearTo) : undefined,
        status: draft.status,
        orderBy: draft.orderBy,
        order: draft.order,
      });
    },
    [updateQuery],
  );

  // Back/forward: adopt external URL changes that differ from local state.
  useEffect(() => {
    const fromUrl = parseCollectionQuery(searchParams);
    if (
      serializeCollectionQuery(fromUrl) !==
      serializeCollectionQuery(queryRef.current)
    ) {
      queryRef.current = fromUrl;
      setQuery(fromUrl);
      setSearchInput(fromUrl.search);
    }
  }, [searchParams]);

  const fetchGames = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const current = queryRef.current;
      const filters = toLibraryServiceFilters(current);
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.platform) params.set("platform", filters.platform);
      if (filters.status) params.set("status", filters.status);
      if (filters.yearFrom !== undefined) {
        params.set("yearFrom", String(filters.yearFrom));
      }
      if (filters.yearTo !== undefined) {
        params.set("yearTo", String(filters.yearTo));
      }
      if (filters.orderBy) {
        params.set("orderBy", filters.orderBy);
        params.set("order", filters.order ?? "asc");
      }
      if (scope.favorite) params.set("favorite", "true");
      if (scope.withoutCollection) params.set("withoutCollection", "true");
      if (scope.collectionId) params.set("collectionId", scope.collectionId);
      const result = await apiRequest<PaginatedResponse<Game>>(
        `/api/games?${params.toString()}`,
        { signal: controller.signal },
      );
      setGames(result.data.map(toPlainGame));
      setPagination(result.pagination);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof ApiRequestError ? err.message : "Falha ao carregar jogos",
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  }, [scope.favorite, scope.withoutCollection, scope.collectionId]);

  useEffect(() => {
    // Initial payload comes from the server; refetch on interaction or retry.
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, reloadKey]);

  useEffect(() => {
    const committed = debouncedSearch;
    if (committed !== queryRef.current.search) {
      updateQuery({ search: committed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const refresh = useCallback(() => {
    fetchGames();
  }, [fetchGames]);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return {
    query,
    searchInput,
    setSearchInput,
    updateQuery,
    updateFilters,
    filterDraft: toFilterDraft(query),
    games,
    pagination,
    isLoading,
    error,
    refresh,
    retry,
  };
}
