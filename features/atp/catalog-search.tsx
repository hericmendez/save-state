"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUISelect from "@/components/RPGUI/Select";
import { useDebouncedValue } from "@/features/collection/use-debounced-value";
import { Collection } from "@/features/games/collection";
import {
  ATP_SEARCH_DEFAULTS,
  applyFixedContext,
  buildAtpBffSearchString,
  defaultOrderForSort,
  hasAtpSearch,
  parseAtpSearchQuery,
  parseYearBound,
  serializeAtpSearchQuery,
  serializeWithFixedContext,
  type AtpFixedContext,
  type AtpSearchQuery,
  type AtpSortBy,
} from "./atp-search-query";
import type { CatalogInitial } from "./atp-search-query";
import { INITIAL_LETTERS } from "./atp-search-query";
import type { AtpPreview, AtpSearchPage } from "./atp-result";
import type { AtpSearchCard } from "./atp-result";
import { useAtpCover } from "./use-atp-cover";
import {
  CATALOG_TABLE_MIN_WIDTH,
  CatalogTableHeader,
  CatalogTableRow,
} from "./catalog-table-row";
import type { Game } from "@/features/shared/types";
import {
  igdbDetailEndpoint,
  libraryByExternalEndpoint,
  searchDetailEndpoint,
  searchEndpoint,
  searchImportEndpoint,
} from "@/features/search/search-endpoints";
import { GameModal } from "@/features/games/game-modal";
import { notifyCollectionsChanged } from "@/features/collections/collections-signal";
import { GameCardFrame } from "@/features/games/game-card-frame";
import { toCardModelFromAtp } from "@/features/games/game-card-model";
import { GameDrawerShell } from "@/features/games/game-drawer-shell";
import { CatalogDrawerContent } from "./catalog-drawer-content";
import { CatalogMenu } from "./catalog-context-menu";
import RPGUInput from "@/components/RPGUI/Input";
interface AtpError {
  message: string;
  status: number | null;
}

function toAtpError(err: unknown): AtpError {
  if (err instanceof ApiRequestError) {
    return { message: err.message, status: err.status };
  }
  return { message: "Falha na busca", status: null };
}

/**
 * Índice alfanumérico da Busca Geral (Todas | 0–9 | # | A–Z).
 *
 * Controlado pelo `query.initial`: a troca reseta a página e preserva os
 * demais filtros/ordenação (ver `handleInitialChange`). Usa o `RPGUISelect`
 * padrão dos filtros (nativo = teclado e leitor de tela gratuitos).
 */
export function InitialSelect({
  value,
  onChange,
}: {
  value: CatalogInitial | "";
  onChange: (next: CatalogInitial | "") => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label htmlFor="catalog-initial" className="text-xs">
        Inicial do jogo
      </label>
      <RPGUISelect
        id="catalog-initial"
        value={value}
        onChange={(event) =>
          onChange(event.target.value as CatalogInitial | "")
        }
        aria-label="Inicial do jogo"
        className="w-auto max-w-full"
      >
        <option value="">Todas as iniciais</option>
        <option value="0-9">0–9</option>
        <option value="#">#</option>
        {INITIAL_LETTERS.map((letter) => (
          <option key={letter} value={letter}>
            {letter}
          </option>
        ))}
      </RPGUISelect>
    </div>
  );
}

function CatalogGridCard({
  card,
  onDetails,
  onImport,
  onToggle,
  onEditAndAdd,
  busy,
  importing,
  editBusy,
}: {
  card: AtpSearchCard;
  onDetails: () => void;
  onImport: () => void;
  onToggle: () => void;
  onEditAndAdd: () => void;
  busy: boolean;
  importing: boolean;
  editBusy: boolean;
}) {
  const coverUrl = useAtpCover(card.atpId, card.coverUrl);
  const presentation = toCardModelFromAtp(card, coverUrl);
  return (
    <CatalogMenu
      owned={card.owned}
      onDetails={onDetails}
      onToggleBacklog={onToggle}
      onEditAndAdd={onEditAndAdd}
      busy={busy}
      editBusy={editBusy}
    >
      <GameCardFrame
        presentation={presentation}
        onDetails={onDetails}
       
      />
    </CatalogMenu>
  );
}

interface TextDraft {
  search: string;
  platform: string;
  genre: string;
  yearMin: string;
  yearMax: string;
  developer: string;
  publisher: string;
}

function draftFromQuery(query: AtpSearchQuery): TextDraft {
  return {
    search: query.search,
    platform: query.platform,
    genre: query.genre,
    yearMin: query.yearMin === undefined ? "" : String(query.yearMin),
    yearMax: query.yearMax === undefined ? "" : String(query.yearMax),
    developer: query.developer,
    publisher: query.publisher,
  };
}

export function CatalogSearch({
  initialPlatform,
  initialDeveloper,
  initialPublisher,
  initialContextName,
  fixedPlatforms,
  fixedFamily,
  fixedPlatformIds,
  initialQuery,
  initialPage,
  initialError,
}: {
  // Directory modes: prefill one filter and auto-run. The full
  // search/preview/import experience is reused unchanged.
  initialPlatform?: string;
  initialDeveloper?: string;
  initialPublisher?: string;
  // Human context for the filter-only empty state (e.g. platform name).
  initialContextName?: string;
  // Route-locked context (platform/family detail pages): the route defines
  // the value, so conflicting URL params can never escape the page context.
  // fixedPlatforms accepts several ATP platform names (e.g. a generation):
  // they travel comma-joined in ONE BFF call — never N requests.
  // fixedPlatformIds carries validated IGDB ids (editorial pages) that
  // are never read from the page URL — only fixed context sets them.
  // Locked inputs are hidden and replaced by a badge.
  fixedPlatforms?: string[];
  fixedFamily?: string;
  fixedPlatformIds?: number[];
  // SSR state from /catalog (URL-driven deep links render server-side).
  initialQuery?: AtpSearchQuery;
  initialPage?: AtpSearchPage | null;
  initialError?: AtpError | null;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fixed: AtpFixedContext = {
    platform:
      fixedPlatforms && fixedPlatforms.length > 0
        ? fixedPlatforms.join(", ")
        : undefined,
    family: fixedFamily,
    platformIds:
      fixedPlatformIds && fixedPlatformIds.length > 0
        ? [...fixedPlatformIds]
        : undefined,
  };

  const seededQuery: AtpSearchQuery = applyFixedContext(
    initialQuery ?? {
      ...ATP_SEARCH_DEFAULTS,
      platform: initialPlatform ?? "",
      developer: initialDeveloper ?? "",
      publisher: initialPublisher ?? "",
    },
    fixed,
  );

  const [query, setQuery] = useState<AtpSearchQuery>(seededQuery);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [draft, setDraft] = useState<TextDraft>(() =>
    draftFromQuery(seededQuery),
  );
  const [result, setResult] = useState<AtpSearchPage | null>(
    initialPage ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AtpError | null>(initialError ?? null);
  const [preview, setPreview] = useState<AtpPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  const queryRef = useRef(query);
  queryRef.current = query;
  const requestIdRef = useRef(0);
  const previewRequestRef = useRef(0);
  // Latest-search-wins cancellation: aborting the previous request keeps
  // stale responses (and their loading state) from ever landing. The
  // requestId check below stays as the complementary guard.
  const abortRef = useRef<AbortController | null>(null);
  const firstLoad = useRef(true);

  const debouncedFilterDraft = useDebouncedValue(
    JSON.stringify({
      platform: draft.platform,
      genre: draft.genre,
      yearMin: draft.yearMin,
      yearMax: draft.yearMax,
      developer: draft.developer,
      publisher: draft.publisher,
    }),
    400,
  );

  const commitToUrl = useCallback(
    (next: AtpSearchQuery) => {
      const serialized = serializeWithFixedContext(next, fixed);
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
        scroll: false,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, pathname, fixed.platform, fixed.family, fixed.platformIds],
  );

  const runSearch = useCallback(
    async (next: AtpSearchQuery) => {
      abortRef.current?.abort();
      if (!hasAtpSearch(next)) {
        requestIdRef.current += 1;
        setResult(null);
        setError(null);
        setIsLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setError(null);
      try {
        const page = await apiRequest<AtpSearchPage>(
          searchEndpoint(buildAtpBffSearchString(next)),
          { signal: controller.signal },
        );
        if (requestId !== requestIdRef.current) return;
        setResult(page);
      } catch (err) {
        // Client-side cancellation only: the BFF may still finish its
        // IGDB work (no signal propagation), but the result is discarded
        // here and no error is surfaced for an intentional abort.
        if (
          typeof err === "object" &&
          err !== null &&
          (err as { name?: unknown }).name === "AbortError"
        ) {
          if (requestId === requestIdRef.current) setIsLoading(false);
          return;
        }
        if (requestId !== requestIdRef.current) return;
        setError(toAtpError(err));
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [],
  );

  // Cancel any in-flight search on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const commitQuery = useCallback(
    (patch: Partial<AtpSearchQuery>, resetPage = true) => {
      // Side effects stay out of the setQuery updater: StrictMode
      // double-invokes updaters in dev, which fired the search twice for
      // a single commit. queryRef mirrors the committed query on every
      // render and every mutation path, so it is the correct source here.
      const current = queryRef.current;
      const next = applyFixedContext(
        {
          ...current,
          ...patch,
          page: resetPage ? 1 : (patch.page ?? current.page),
        },
        fixed,
      );
      queryRef.current = next;
      setQuery(next);
      setDraft(draftFromQuery(next));
      commitToUrl(next);
      void runSearch(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitToUrl, runSearch, fixed.platform, fixed.family, fixed.platformIds],
  );

  // Refinement filters (platform/genre/year range/developer/publisher)
  // stay debounced; the textual search is button/Enter-only and keeps the
  // last committed query.search until handleSearch commits draft.search.
  useEffect(() => {
    if (firstLoad.current) return;
    const parsed = JSON.parse(debouncedFilterDraft) as Omit<TextDraft, "search">;
    const current = queryRef.current;
    const next = applyFixedContext(
      {
        ...current,
        platform: parsed.platform.trim().slice(0, 100),
        genre: parsed.genre.trim().slice(0, 100),
        yearMin: parseYearBound(parsed.yearMin),
        yearMax: parseYearBound(parsed.yearMax),
        developer: parsed.developer.trim().slice(0, 100),
        publisher: parsed.publisher.trim().slice(0, 100),
        page: 1,
      },
      fixed,
    );
    if (serializeAtpSearchQuery(next) !== serializeAtpSearchQuery(current)) {
      queryRef.current = next;
      setQuery(next);
      commitToUrl(next);
      void runSearch(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilterDraft]);

  // Initial SSR payload; auto-run for deep links and directory modes.
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      if (initialPage || initialError) return;
      if (hasAtpSearch(queryRef.current)) {
        void runSearch(queryRef.current);
      }
    }
    // Dev StrictMode mounts, unmounts and remounts the same instance: the
    // unmount cleanup aborts the in-flight first fetch, so re-arm the
    // one-shot — the remount refires it and exactly one request stays
    // live. Real unmounts leave a dead instance behind; production mounts
    // run this effect exactly once, so behavior there is unchanged.
    return () => {
      firstLoad.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back/forward: adopt external URL changes that differ from local state.
  // Fixed route context prevails over any contradictory URL param.
  useEffect(() => {
    if (firstLoad.current) return;
    const fromUrl = applyFixedContext(parseAtpSearchQuery(searchParams), fixed);
    if (
      serializeAtpSearchQuery(fromUrl) !==
      serializeAtpSearchQuery(queryRef.current)
    ) {
      queryRef.current = fromUrl;
      setQuery(fromUrl);
      setDraft(draftFromQuery(fromUrl));
      void runSearch(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Route-locked context under a preserved instance. Client-side
  // navigation between two detail pages of the same dynamic segment
  // (e.g. /catalog/platforms/a → /catalog/platforms/b) reuses this
  // component: the query string stays empty, so the searchParams effect
  // above cannot observe the switch and the seeded useState never
  // refreshes. Re-commit the query (free refinements preserved, page
  // reset) so the new context fetches exactly once.
  const fixedKey = `${fixed.platform ?? ""}\n${fixed.family ?? ""}\n${(fixed.platformIds ?? []).join(",")}`;
  const prevFixedKeyRef = useRef(fixedKey);
  useEffect(() => {
    if (prevFixedKeyRef.current === fixedKey) return;
    prevFixedKeyRef.current = fixedKey;
    commitQuery({}, true);
  }, [fixedKey, commitQuery]);

  function handleClearFilters() {
    setDraft((current) => ({
      ...current,
      platform: fixed.platform ?? "",
      genre: "",
      yearMin: "",
      yearMax: "",
      developer: "",
      publisher: "",
    }));
    // Reset filters and sort, but keep the search text, view mode and
    // page size; fixed route context is re-applied, never cleared.
    // The alphabetical initial resets to Todos.
    commitQuery({
      platform: fixed.platform ?? "",
      genre: "",
      yearMin: undefined,
      yearMax: undefined,
      developer: "",
      publisher: "",
      family: fixed.family ?? "",
      initial: "",
      sortBy: undefined,
      order: "asc",
    });
  }

  function handleSortByChange(value: string) {
    const sortBy: AtpSortBy | undefined =
      value === "title" || value === "year" ? value : undefined;
    // A fresh sort starts from its own default direction (title ASC,
    // year DESC); relevance carries no direction. Page resets: the new
    // ordering may not have the current page's items.
    commitQuery({
      sortBy,
      order: sortBy === undefined ? "asc" : defaultOrderForSort(sortBy),
    });
  }

  function handleOrderToggle() {
    if (query.sortBy === undefined) return;
    commitQuery({ order: query.order === "asc" ? "desc" : "asc" });
  }

  function handleInitialChange(initial: CatalogInitial | "") {
    // Trocar de inicial reseta a página: a nova letra tem outro universo
    // de resultados. "Todos" remove SÓ o filtro de inicial (o patch só
    // toca `initial`; plataforma, gênero, texto e ordenação ficam).
    commitQuery({ initial });
  }

  async function handlePreview(atpId: string) {
    const requestId = ++previewRequestRef.current;
    setIsPreviewLoading(true);
    setError(null);
    try {
      const detail = await apiRequest<AtpPreview>(
        searchDetailEndpoint(atpId),
      );
      if (requestId !== previewRequestRef.current) return;
      if (detail.owned) {
        try {
          const game = await apiRequest<Game>(
            libraryByExternalEndpoint(atpId),
          );
          if (requestId !== previewRequestRef.current) return;
          setSelectedGame(game);
          setPreview(null);
          return;
        } catch {
          // Fallback to preview dialog if Game lookup fails (stale owned flag)
        }
      }
      setPreview(detail);
    } catch (err) {
      if (requestId !== previewRequestRef.current) return;
      setError(toAtpError(err));
    } finally {
      if (requestId === previewRequestRef.current) setIsPreviewLoading(false);
    }
  }

  async function handleDetails(card: AtpSearchCard) {
    if (card.owned) {
      const requestId = ++previewRequestRef.current;
      setIsPreviewLoading(true);
      setError(null);
      try {
        const game = await apiRequest<Game>(
          libraryByExternalEndpoint(card.atpId),
        );
        if (requestId !== previewRequestRef.current) return;
        setSelectedGame(game);
        return;
      } catch {
        // Fallback to normal preview flow
      } finally {
        if (requestId === previewRequestRef.current) setIsPreviewLoading(false);
      }
    }
    await handlePreview(card.atpId);
  }

  async function handleImport(atpId: string) {
    setImportingId(atpId);
    setError(null);
    try {
      await apiRequest(searchImportEndpoint(), {
        method: "POST",
        body: { externalId: atpId },
      });
      setPreview(null);
      // Navigation to /backlog renders fresh server data; no refresh() call
      // (refreshing here could cancel the in-flight navigation).
      router.push("/backlog");
    } catch (err) {
      setError(toAtpError(err));
      // Re-sync owned state (e.g. a duplicate race): the preview/card then
      // shows "No backlog" instead of a doomed action.
      try {
        const detail = await apiRequest<AtpPreview>(
          searchDetailEndpoint(atpId),
        );
        setPreview(detail);
        setResult((current) =>
          current
            ? {
                ...current,
                data: current.data.map((item) =>
                  item.atpId === atpId
                    ? { ...item, owned: detail.owned }
                    : item,
                ),
              }
            : current,
        );
      } catch {
        // The import error above is already reported; ignore refresh noise.
      }
    } finally {
      setImportingId(null);
    }
  }

  async function handleEditAndAdd(card: AtpSearchCard) {
    if (editLoadingId) return;
    setEditLoadingId(card.atpId);
    setError(null);
    try {
      // Fail fast through the same IGDB source the form loads: results
      // without a compatible IGDB id never navigate. The menu already
      // closed (CustomContextMenu closes on item click before onClick runs).
      await apiRequest<AtpPreview>(igdbDetailEndpoint(card.atpId));
      router.push(`/backlog/new?externalId=${encodeURIComponent(card.atpId)}`);
    } catch (err) {
      setError(toAtpError(err));
    } finally {
      setEditLoadingId(null);
    }
  }

  async function handleToggleBacklog(card: AtpSearchCard) {    if (importingId) return;
    setImportingId(card.atpId);
    setError(null);
    try {
      if (card.owned) {
        const game = await apiRequest<Game>(libraryByExternalEndpoint(card.atpId));
        await apiRequest(`/api/games/${game._id}`, { method: "DELETE" });
        // Deleting a UserGame drops its collection memberships: refresh
        // the sidebar counts. Importing adds no memberships (no notify).
        notifyCollectionsChanged();
        setResult((current) =>
          current
            ? {
                ...current,
                data: current.data.map((item) =>
                  item.atpId === card.atpId ? { ...item, owned: false } : item,
                ),
              }
            : current,
        );
        setPreview((current) =>
          current && current.atpId === card.atpId ? { ...current, owned: false } : current,
        );
        if (selectedGame) {
          // If the removed game was open in GameModal, close it
          try {
            const byAtp = await apiRequest<Game>(libraryByExternalEndpoint(card.atpId)).catch(() => null);
            if (!byAtp) setSelectedGame(null);
          } catch {
            setSelectedGame(null);
          }
        }
      } else {
        await apiRequest(searchImportEndpoint(), { method: "POST", body: { externalId: card.atpId } });
        setResult((current) =>
          current
            ? {
                ...current,
                data: current.data.map((item) =>
                  item.atpId === card.atpId ? { ...item, owned: true } : item,
                ),
              }
            : current,
        );
        setPreview((current) =>
          current && current.atpId === card.atpId ? { ...current, owned: true } : current,
        );
      }
    } catch (err) {
      setError(toAtpError(err));
      try {
        const detail = await apiRequest<AtpPreview>(searchDetailEndpoint(card.atpId));
        setPreview(detail);
        setResult((current) =>
          current
            ? {
                ...current,
                data: current.data.map((item) =>
                  item.atpId === card.atpId ? { ...item, owned: detail.owned } : item,
                ),
              }
            : current,
        );
      } catch {
        // ignore refresh noise
      }
    } finally {
      setImportingId(null);
    }
  }

  function updateDraft(patch: Partial<TextDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const handleSearch = useCallback(() => {
    const trimmed = draft.search.trim().slice(0, 200);
    const current = queryRef.current;
    const next = applyFixedContext({ ...current, search: trimmed, page: 1 }, fixed);
    if (serializeAtpSearchQuery(next) !== serializeAtpSearchQuery(current)) {
      queryRef.current = next;
      setQuery(next);
      setDraft((prev) => ({ ...prev, search: trimmed }));
      commitToUrl(next);
      void runSearch(next);
    } else if (hasAtpSearch(next)) {
      void runSearch(next);
    }
  }, [draft.search, commitToUrl, runSearch, fixed]);

  // Locked route context is not clearable; only free refinements count.
  // An explicit sort counts as a refinement; direction alone does not.
  // The alphabetical initial is a refinement (Todos = absent).
  const hasRefinement =
    (fixed.platform === undefined && draft.platform.trim() !== "") ||
    draft.genre.trim() !== "" ||
    draft.yearMin.trim() !== "" ||
    draft.yearMax.trim() !== "" ||
    draft.developer.trim() !== "" ||
    draft.publisher.trim() !== "" ||
    query.initial !== "" ||
    query.sortBy !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">
          {initialContextName ?? "Busca Geral"}
        </h1>
      </header>
      <div className="rpgui-container framed-golden flex flex-col gap-2 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <RPGUInput
            className="w-full min-w-0 flex-1"
            value={draft.search}
            onChange={(event) => updateDraft({ search: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Buscar pelo nome do jogo…"
            maxLength={200}
            aria-label="Buscar pelo nome do jogo"
            type="search"
          />
          <RPGUIButton type="button" title="Buscar" onClick={handleSearch} className="w-full shrink-0 sm:w-auto" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InitialSelect value={query.initial} onChange={handleInitialChange} />
          <label htmlFor="catalog-sort" className="text-xs">
            Ordenar por
          </label>
          <RPGUISelect
            id="catalog-sort"
            value={query.sortBy ?? "relevance"}
            onChange={(event) => handleSortByChange(event.target.value)}
            aria-label="Ordenação dos resultados"
            className="w-auto max-w-full"
          >
            <option value="relevance">Relevância</option>
            <option value="title">Título</option>
            <option value="year">Ano</option>
          </RPGUISelect>
          <RPGUIButton
            type="button"
            title={query.order === "asc" ? "ASC ▲" : "DESC ▼"}
            onClick={handleOrderToggle}
            disabled={query.sortBy === undefined}
            aria-label="Alternar direção da ordenação"
          />
          <RPGUIButton
            type="button"
            title={showAdvanced ? "Filtros avançados ▾" : "Filtros avançados ▸"}
            onClick={() => setShowAdvanced((current) => !current)}
            aria-expanded={showAdvanced}
          />
          <RPGUIButton
            type="button"
            title="Limpar filtros"
            onClick={handleClearFilters}
            disabled={!hasRefinement}
          />
        </div>
        {showAdvanced ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {fixed.platform === undefined ? (
            <RPGUInput
              className="w-full"
              value={draft.platform}
              onChange={(event) => updateDraft({ platform: event.target.value })}
              placeholder="Plataforma"
              maxLength={100}
              aria-label="Filtrar por plataforma"
            />
          ) : (
            <p className="rpgui-container framed-grey px-2 py-1 text-xs">
              {fixedPlatforms && fixedPlatforms.length > 1
                ? `${fixedPlatforms.length} plataformas`
                : `Plataforma: ${fixed.platform}`}
            </p>
          )}
          <RPGUInput
            className="w-full"
            value={draft.genre}
            onChange={(event) => updateDraft({ genre: event.target.value })}
            placeholder="Gênero"
            maxLength={100}
            aria-label="Filtrar por gênero"
          />
          <RPGUInput
            className="w-full"
            value={draft.yearMin}
            onChange={(event) => updateDraft({ yearMin: event.target.value })}
            placeholder="Ano mínimo"
            inputMode="numeric"
            maxLength={4}
            aria-label="Filtrar por ano mínimo de lançamento"
          />
          <RPGUInput
            className="w-full"
            value={draft.yearMax}
            onChange={(event) => updateDraft({ yearMax: event.target.value })}
            placeholder="Ano máximo"
            inputMode="numeric"
            maxLength={4}
            aria-label="Filtrar por ano máximo de lançamento"
          />
          <RPGUInput
            className="w-full"
            value={draft.developer}
            onChange={(event) => updateDraft({ developer: event.target.value })}
            placeholder="Desenvolvedora"
            maxLength={100}
            aria-label="Filtrar por desenvolvedora"
          />
          <RPGUInput
            className="w-full"
            value={draft.publisher}
            onChange={(event) => updateDraft({ publisher: event.target.value })}
            placeholder="Publicadora"
            maxLength={100}
            aria-label="Filtrar por publicadora"
          />
          {fixed.family !== undefined && (
            <p className="rpgui-container framed-grey px-2 py-1 text-xs">
              Família: {fixed.family}
            </p>
          )}
          </div>
        ) : null}
        </div>
      {error && (
        <p role="alert" className="rpgui-container framed-grey p-3">
          {error.status === 503
            ? "O catálogo está temporariamente indisponível. Tente novamente em instantes."
            : error.message}
        </p>
      )}
      {isPreviewLoading && (
        <p className="rpgui-container framed-grey p-3 font-display text-xs" aria-live="polite">
          [ Carregando detalhes... ]
        </p>
      )}
      {isLoading && result === null ? (
        <div className="rpgui-container framed-grey p-4 text-center">
          <p className="font-display text-sm" aria-live="polite">
            [ Buscando... ]
          </p>
        </div>
      ) : result ? (
        <Collection
          items={result.data}
          getItemKey={(item) => item.atpId}
          renderGridItem={(item) => (
            <CatalogGridCard
              card={item}
              onDetails={() => void handleDetails(item)}
              onImport={() => void handleImport(item.atpId)}
              onToggle={() => void handleToggleBacklog(item)}
              onEditAndAdd={() => void handleEditAndAdd(item)}
              busy={importingId === item.atpId}
              importing={importingId === item.atpId}
              editBusy={editLoadingId === item.atpId}
            />
          )}
          renderListItem={(item) => (
            <CatalogMenu
              owned={item.owned}
              onDetails={() => void handleDetails(item)}
              onToggleBacklog={() => void handleToggleBacklog(item)}
              onEditAndAdd={() => void handleEditAndAdd(item)}
              busy={importingId === item.atpId}
              editBusy={editLoadingId === item.atpId}
            >
              <article className="rpgui-container framed-golden grid grid-cols-[1fr_auto] items-center gap-3 p-3">
                <div className="min-w-0">
                  <h3 className="font-display truncate text-sm">{item.name}</h3>
                  <p className="mt-1 text-xs">
                    {[item.year, ...item.platforms.slice(0, 3)].filter(Boolean).join(" · ")}
                  </p>
                  {item.genres.length > 0 && <p className="truncate text-xs">{item.genres.slice(0, 3).join(", ")}</p>}
                  {item.owned && <p className="mt-1 text-xs">✓ No backlog</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <RPGUIButton type="button" title="Detalhes" onClick={() => void handleDetails(item)} />
                  {!item.owned && (
                    <RPGUIButton
                      type="button"
                      title={importingId === item.atpId ? "Importando…" : "Adicionar"}
                      onClick={() => void handleImport(item.atpId)}
                      disabled={importingId === item.atpId}
                    />
                  )}
                </div>
              </article>
            </CatalogMenu>
          )}
          search={draft.search}
          onSearchChange={(value) => updateDraft({ search: value })}
          viewMode={query.viewMode}
          onViewModeChange={(mode) => commitQuery({ viewMode: mode }, false)}
          isLoading={isLoading}
          error={null}
          onRetry={() => void runSearch(queryRef.current)}
          tableLabel="Jogos em tabela"
          tableMinWidthClass={CATALOG_TABLE_MIN_WIDTH}
          renderListTable={{
            header: <CatalogTableHeader />,
            renderRow: (item) => (
              <CatalogMenu
                owned={item.owned}
                onDetails={() => void handleDetails(item)}
                onToggleBacklog={() => void handleToggleBacklog(item)}
                onEditAndAdd={() => void handleEditAndAdd(item)}
                busy={importingId === item.atpId}
                editBusy={editLoadingId === item.atpId}
              >
                <CatalogTableRow
                  card={item}
                  onDetails={() => void handleDetails(item)}
                  onImport={() => void handleImport(item.atpId)}
                  importing={importingId === item.atpId}
                />
              </CatalogMenu>
            ),
          }}
          pagination={result.pagination}
          currentPage={query.page}
          onPageChange={(page) => commitQuery({ page }, false)}
          itemsPerPage={query.limit}
          onItemsPerPageChange={(limit) => commitQuery({ limit })}
          emptyMessage={
            query.initial !== ""
              ? `Nenhum jogo encontrado para a inicial "${query.initial}".`
              : initialContextName
                ? `Nenhum jogo encontrado para ${initialContextName}.`
                : "Nenhum jogo encontrado com os filtros aplicados."
          }
        />
      ) : (
        <p>
          Busque pelo catálogo global para descobrir jogos e adicioná-los ao
          seu backlog.
        </p>
      )}
      {preview && (
        <GameDrawerShell
          key={preview.atpId}
          open={!!preview}
          title={preview.name}
          onClose={() => setPreview(null)}
        >
          <CatalogDrawerContent
            preview={preview}
            onImport={() => void handleImport(preview.atpId)}
            importing={importingId === preview.atpId}
            onClose={() => setPreview(null)}
          />
        </GameDrawerShell>
      )}
      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onUpdated={() => {
          if (result) void runSearch(queryRef.current);
        }}
      />
    </div>
  );
}
