"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import { useDebouncedValue } from "@/features/collection/use-debounced-value";
import { Collection } from "@/features/games/collection";
import {
  ATP_SEARCH_DEFAULTS,
  applyFixedContext,
  buildAtpBffSearchString,
  hasAtpSearch,
  parseAtpSearchQuery,
  serializeAtpSearchQuery,
  serializeWithFixedContext,
  type AtpFixedContext,
  type AtpSearchQuery,
} from "./atp-search-query";
import type { AtpPreview, AtpSearchPage } from "./atp-result";
import { AtpResultCard, AtpResultListItem } from "./atp-result-card";

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

interface TextDraft {
  search: string;
  platform: string;
  genre: string;
  year: string;
  developer: string;
  publisher: string;
  family: string;
}

function draftFromQuery(query: AtpSearchQuery): TextDraft {
  return {
    search: query.search,
    platform: query.platform,
    genre: query.genre,
    year: query.year === undefined ? "" : String(query.year),
    developer: query.developer,
    publisher: query.publisher,
    family: query.family,
  };
}

function PreviewDialog({
  preview,
  onClose,
  onImport,
  importing,
}: {
  preview: AtpPreview;
  onClose: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={preview.name}
    >
      <div className="rpgui-container framed-golden max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="font-display text-xl">{preview.name}</h2>
        <div className="mt-3 flex flex-col gap-1 text-sm">
          {preview.year !== null && (
            <p>
              <strong>Ano:</strong> {preview.year}
            </p>
          )}
          {preview.platforms.length > 0 && (
            <p>
              <strong>Plataformas:</strong> {preview.platforms.join(", ")}
            </p>
          )}
          {preview.genres.length > 0 && (
            <p>
              <strong>Gêneros:</strong> {preview.genres.join(", ")}
            </p>
          )}
          {preview.developers.length > 0 && (
            <p>
              <strong>Desenvolvedoras:</strong> {preview.developers.join(", ")}
            </p>
          )}
          {preview.publishers.length > 0 && (
            <p>
              <strong>Publicadoras:</strong> {preview.publishers.join(", ")}
            </p>
          )}
          {preview.manualDuplicate ? (
            <p>
              <strong>Atenção:</strong> você já tem o jogo manual{" "}
              &ldquo;{preview.manualDuplicate.name}&rdquo;. Importar criará um
              registro separado.
            </p>
          ) : null}
          {preview.owned && <p>✓ Este jogo já está no seu backlog.</p>}
        </div>
        <div className="mt-4 flex gap-2">
          {preview.owned ? (
            <RPGUIButton
              type="button"
              title="No backlog ✓"
              onClick={onClose}
            />
          ) : (
            <RPGUIButton
              type="button"
              title={importing ? "Importando…" : "Adicionar ao Backlog"}
              onClick={onImport}
              disabled={importing}
            />
          )}
          <RPGUIButton type="button" title="Fechar" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}

export function CatalogSearch({
  initialPlatform,
  initialDeveloper,
  initialPublisher,
  initialContextName,
  initialFamily,
  fixedPlatforms,
  fixedFamily,
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
  // Family prefill (same behavior as the other initial* filters).
  initialFamily?: string;
  // Route-locked context (platform/family detail pages): the route defines
  // the value, so conflicting URL params can never escape the page context.
  // fixedPlatforms accepts several ATP platform names (e.g. a generation):
  // they travel comma-joined in ONE BFF call — never N requests.
  // Locked inputs are hidden and replaced by a badge.
  fixedPlatforms?: string[];
  fixedFamily?: string;
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
  };

  const seededQuery: AtpSearchQuery = applyFixedContext(
    initialQuery ?? {
      ...ATP_SEARCH_DEFAULTS,
      platform: initialPlatform ?? "",
      developer: initialDeveloper ?? "",
      publisher: initialPublisher ?? "",
      family: initialFamily ?? "",
    },
    fixed,
  );

  const [query, setQuery] = useState<AtpSearchQuery>(seededQuery);
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

  const queryRef = useRef(query);
  queryRef.current = query;
  const requestIdRef = useRef(0);
  const previewRequestRef = useRef(0);
  const firstLoad = useRef(true);

  const debouncedDraft = useDebouncedValue(JSON.stringify(draft), 400);

  const commitToUrl = useCallback(
    (next: AtpSearchQuery) => {
      const serialized = serializeWithFixedContext(next, fixed);
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
        scroll: false,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, pathname, fixed.platform, fixed.family],
  );

  const runSearch = useCallback(
    async (next: AtpSearchQuery) => {
      if (!hasAtpSearch(next)) {
        requestIdRef.current += 1;
        setResult(null);
        setError(null);
        setIsLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const page = await apiRequest<AtpSearchPage>(
          `/api/atp/search?${buildAtpBffSearchString(next)}`,
        );
        if (requestId !== requestIdRef.current) return;
        setResult(page);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(toAtpError(err));
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [],
  );

  const commitQuery = useCallback(
    (patch: Partial<AtpSearchQuery>, resetPage = true) => {
      setQuery((current) => {
        const next = applyFixedContext(
          {
            ...current,
            ...patch,
            page: resetPage ? 1 : (patch.page ?? current.page),
          },
          fixed,
        );
        setDraft(draftFromQuery(next));
        commitToUrl(next);
        void runSearch(next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitToUrl, runSearch, fixed.platform, fixed.family],
  );

  // Text inputs stay local while typing; the settled draft commits once.
  // Fixed route context is re-applied so URL params can never escape it.
  useEffect(() => {
    if (firstLoad.current) return;
    const parsed = JSON.parse(debouncedDraft) as TextDraft;
    const current = queryRef.current;
    const year = /^\d{4}$/.test(parsed.year.trim())
      ? Number(parsed.year.trim())
      : undefined;
    const next = applyFixedContext(
      {
        ...current,
        search: parsed.search.trim().slice(0, 200),
        platform: parsed.platform.trim().slice(0, 100),
        genre: parsed.genre.trim().slice(0, 100),
        year,
        developer: parsed.developer.trim().slice(0, 100),
        publisher: parsed.publisher.trim().slice(0, 100),
        family: parsed.family.trim().slice(0, 100),
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
  }, [debouncedDraft]);

  // Initial SSR payload; auto-run for deep links and directory modes.
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      if (initialPage || initialError) return;
      if (hasAtpSearch(queryRef.current)) {
        void runSearch(queryRef.current);
      }
    }
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

  function handleClearFilters() {
    setDraft((current) => ({
      ...current,
      platform: fixed.platform ?? "",
      genre: "",
      year: "",
      developer: "",
      publisher: "",
      family: fixed.family ?? "",
    }));
  }

  async function handlePreview(atpId: string) {
    const requestId = ++previewRequestRef.current;
    setIsPreviewLoading(true);
    setError(null);
    try {
      const detail = await apiRequest<AtpPreview>(
        `/api/atp/games/${encodeURIComponent(atpId)}`,
      );
      if (requestId !== previewRequestRef.current) return;
      setPreview(detail);
    } catch (err) {
      if (requestId !== previewRequestRef.current) return;
      setError(toAtpError(err));
    } finally {
      if (requestId === previewRequestRef.current) setIsPreviewLoading(false);
    }
  }

  async function handleImport(atpId: string) {
    setImportingId(atpId);
    setError(null);
    try {
      await apiRequest("/api/atp/import", {
        method: "POST",
        body: { atpId },
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
          `/api/atp/games/${encodeURIComponent(atpId)}`,
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

  function updateDraft(patch: Partial<TextDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  // Locked route context is not clearable; only free refinements count.
  const hasRefinement =
    (fixed.platform === undefined && draft.platform.trim() !== "") ||
    draft.genre.trim() !== "" ||
    draft.year.trim() !== "" ||
    draft.developer.trim() !== "" ||
    draft.publisher.trim() !== "" ||
    (fixed.family === undefined && draft.family.trim() !== "");

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">
          {initialContextName ?? "Busca Geral"}
        </h1>
      </header>
      <div className="rpgui-container framed-golden flex flex-col gap-2 p-4">
        <input
          className="rpgui-input w-full"
          value={draft.search}
          onChange={(event) => updateDraft({ search: event.target.value })}
          placeholder="Buscar no catálogo…"
          maxLength={200}
          aria-label="Buscar no catálogo"
          type="search"
        />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {fixed.platform === undefined ? (
            <input
              className="rpgui-input w-full"
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
          <input
            className="rpgui-input w-full"
            value={draft.genre}
            onChange={(event) => updateDraft({ genre: event.target.value })}
            placeholder="Gênero"
            maxLength={100}
            aria-label="Filtrar por gênero"
          />
          <input
            className="rpgui-input w-full"
            value={draft.year}
            onChange={(event) => updateDraft({ year: event.target.value })}
            placeholder="Ano"
            inputMode="numeric"
            maxLength={4}
            aria-label="Filtrar por ano de lançamento"
          />
          <input
            className="rpgui-input w-full"
            value={draft.developer}
            onChange={(event) => updateDraft({ developer: event.target.value })}
            placeholder="Desenvolvedora"
            maxLength={100}
            aria-label="Filtrar por desenvolvedora"
          />
          <input
            className="rpgui-input w-full"
            value={draft.publisher}
            onChange={(event) => updateDraft({ publisher: event.target.value })}
            placeholder="Publicadora"
            maxLength={100}
            aria-label="Filtrar por publicadora"
          />
          {fixed.family === undefined ? (
            <input
              className="rpgui-input w-full"
              value={draft.family}
              onChange={(event) => updateDraft({ family: event.target.value })}
              placeholder="Família"
              maxLength={100}
              aria-label="Filtrar por família"
            />
          ) : (
            <p className="rpgui-container framed-grey px-2 py-1 text-xs">
              Família: {fixed.family}
            </p>
          )}
          <RPGUIButton
            type="button"
            title="Limpar filtros"
            onClick={handleClearFilters}
            disabled={!hasRefinement}
          />
        </div>
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
            <AtpResultCard
              item={item}
              onPreview={() => handlePreview(item.atpId)}
              onImport={() => handleImport(item.atpId)}
              importing={importingId === item.atpId}
            />
          )}
          renderListItem={(item) => (
            <AtpResultListItem
              item={item}
              onPreview={() => handlePreview(item.atpId)}
              onImport={() => handleImport(item.atpId)}
              importing={importingId === item.atpId}
            />
          )}
          search={draft.search}
          onSearchChange={(value) => updateDraft({ search: value })}
          viewMode={query.viewMode}
          onViewModeChange={(mode) => commitQuery({ viewMode: mode }, false)}
          isLoading={isLoading}
          error={null}
          onRetry={() => void runSearch(queryRef.current)}
          pagination={result.pagination}
          currentPage={query.page}
          onPageChange={(page) => commitQuery({ page }, false)}
          itemsPerPage={query.limit}
          onItemsPerPageChange={(limit) => commitQuery({ limit })}
          emptyMessage={
            initialContextName
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
        <PreviewDialog
          key={preview.atpId}
          preview={preview}
          onClose={() => setPreview(null)}
          onImport={() => handleImport(preview.atpId)}
          importing={importingId === preview.atpId}
        />
      )}
    </div>
  );
}
