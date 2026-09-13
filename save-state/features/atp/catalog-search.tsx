"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";

export interface AtpSearchCard {
  atpId: string;
  name: string;
  year: number | null;
  platforms: string[];
  genres: string[];
}

interface AtpSearchPage {
  data: AtpSearchCard[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface AtpPreview {
  atpId: string;
  name: string;
  year: number | null;
  platforms: string[];
  developers: string[];
  publishers: string[];
  genres: string[];
  releases: Array<{
    platform: string | null;
    region: string | null;
    year: number | null;
    version: string | null;
    edition: string | null;
  }>;
  externalIdentifiers: Array<{ source: string; id: string }>;
  coverUrl: string | null;
}

function useAtpCover(atpId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ coverUrl: string | null }>(
      `/api/atp/games/${encodeURIComponent(atpId)}/cover`,
    )
      .then((result) => {
        if (!cancelled) setUrl(result.coverUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [atpId]);
  return url;
}

function ResultCard({
  item,
  onPreview,
  onImport,
  importing,
}: {
  item: AtpSearchCard;
  onPreview: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  const coverUrl = useAtpCover(item.atpId);
  return (
    <article className="rpgui-container framed-golden flex gap-3 p-3">
      <div className="h-24 w-20 shrink-0 overflow-hidden bg-black/40">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-display truncate text-sm">{item.name}</h3>
        <p className="text-xs">
          {[item.year, ...item.platforms.slice(0, 3)].filter(Boolean).join(" · ")}
        </p>
        <p className="truncate text-xs">{item.genres.slice(0, 3).join(", ")}</p>
        <div className="mt-auto flex gap-2 pt-2">
          <button className="rpgui-button" type="button" onClick={onPreview}>
            Ver
          </button>
          <button
            className="rpgui-button"
            type="button"
            onClick={onImport}
            disabled={importing}
          >
            {importing ? "Importando…" : "Importar"}
          </button>
        </div>
      </div>
    </article>
  );
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
        {preview.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.coverUrl} alt="" aria-hidden="true" className="mt-3 max-h-64 object-contain" />
        ) : null}
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
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className="rpgui-button"
            type="button"
            onClick={onImport}
            disabled={importing}
          >
            {importing ? "Importando…" : "Importar para a biblioteca"}
          </button>
          <button className="rpgui-button" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export function CatalogSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AtpSearchPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AtpPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function runSearch(nextQuery: string, nextPage: number) {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: nextQuery,
        page: String(nextPage),
        limit: "20",
      });
      const page_ = await apiRequest<AtpSearchPage>(
        `/api/atp/search?${params.toString()}`,
      );
      if (requestId !== requestIdRef.current) return;
      setResult(page_);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiRequestError ? err.message : "Falha na busca");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSubmitted(query.trim());
    setPage(1);
    void runSearch(query.trim(), 1);
  }

  async function handlePreview(atpId: string) {
    setIsPreviewLoading(true);
    setError(null);
    try {
      const detail = await apiRequest<AtpPreview>(
        `/api/atp/games/${encodeURIComponent(atpId)}`,
      );
      setPreview(detail);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao carregar");
    } finally {
      setIsPreviewLoading(false);
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
      setError(err instanceof ApiRequestError ? err.message : "Falha ao importar");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Catálogo</h1>
      </header>
      <form
        onSubmit={handleSubmit}
        className="rpgui-container framed-golden flex gap-2 p-4"
      >
        <input
          className="rpgui-input flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar no catálogo…"
          maxLength={200}
        />
        <button className="rpgui-button" type="submit" disabled={isLoading}>
          Buscar
        </button>
      </form>
      {error && (
        <p role="alert" className="rpgui-container framed-grey p-3">
          {error}
        </p>
      )}
      {isPreviewLoading && (
        <p className="rpgui-container framed-grey p-3 font-display text-xs" aria-live="polite">
          [ Carregando detalhes... ]
        </p>
      )}
      {isLoading ? (
        <div className="rpgui-container framed-grey p-4 text-center">
          <p className="font-display text-sm" aria-live="polite">
            [ Buscando... ]
          </p>
        </div>
      ) : result ? (
        result.data.length === 0 ? (
          <p>Nenhum jogo encontrado para “{submitted}”.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {result.data.map((item) => (
                <ResultCard
                  key={item.atpId}
                  item={item}
                  onPreview={() => handlePreview(item.atpId)}
                  onImport={() => handleImport(item.atpId)}
                  importing={importingId === item.atpId}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="rpgui-button"
                type="button"
                disabled={!result.pagination.hasPreviousPage}
                onClick={() => {
                  const next = page - 1;
                  setPage(next);
                  void runSearch(submitted, next);
                }}
              >
                ‹
              </button>
              <button
                className="rpgui-button"
                type="button"
                disabled={!result.pagination.hasNextPage}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void runSearch(submitted, next);
                }}
              >
                ›
              </button>
            </div>
          </>
        )
      ) : (
        <p>Busque pelo catálogo canônico para importar jogos.</p>
      )}
      {preview && (
        <PreviewDialog
          preview={preview}
          onClose={() => setPreview(null)}
          onImport={() => handleImport(preview.atpId)}
          importing={importingId === preview.atpId}
        />
      )}
    </div>
  );
}
