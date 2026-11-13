"use client";

import { useRef, useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUInput from "@/components/RPGUI/Input";
import { igdbCoversEndpoint } from "@/features/search/search-endpoints";

interface CoverCandidate {
  url: string;
  source: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Cover lookup for the game form. Always queries IGDB directly
 * (Etapa 5 — independent of SEARCH_METHOD), shows candidate
 * thumbnails, and fills `form.cover` with the selected URL only.
 * The boundary is always `IGDB cover result → string URL →
 * GameFormState.cover`.
 */
export function GameCoverSearch({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState(query);
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  function openDialog() {
    setSearchText(query);
    setCandidates(null);
    setError(null);
    setFailedUrls([]);
    setOpen(true);
  }

  async function runSearch(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: trimmed });
      const candidates = await apiRequest<CoverCandidate[]>(
        igdbCoversEndpoint(params.toString()),
      );
      if (requestId !== requestIdRef.current) return;
      setCandidates(candidates);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiRequestError ? err.message : "Falha na busca");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  return (
    <>
      <RPGUIButton type="button" title="Buscar capa" onClick={openDialog} />
      {open && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Buscar capa do jogo"
        >
          <div className="rpgui-container framed-golden max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
            <h2 className="font-display text-xl">Buscar capa</h2>
            {/* NOTE: plain div + onClick, not a nested <form>: this dialog
                renders inside GameForm's <form> and nested forms would
                submit the outer form instead. */}
            <div className="mt-3 flex gap-2">
              <RPGUInput
                className="flex-1"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runSearch(searchText);
                  }
                }}
                placeholder="Nome do jogo…"
                maxLength={200}
              />
              <RPGUIButton
                type="button"
                title="Buscar"
                disabled={isLoading}
                onClick={() => void runSearch(searchText)}
              />
            </div>
            {error && (
              <p role="alert" className="mt-3">
                {error}
              </p>
            )}
            {isLoading && <p className="mt-3">Buscando…</p>}
            {candidates !== null && (
              <div className="mt-3">
                {candidates.length === 0 ? (
                  <p>Nenhuma capa encontrada.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {candidates
                      .filter((candidate) => !failedUrls.includes(candidate.url))
                      .map((candidate) => (
                        <button
                          key={candidate.url}
                          className="rpgui-container framed-grey p-1"
                          type="button"
                          onClick={() => {
                            onSelect(candidate.url);
                            setOpen(false);
                          }}
                          aria-label={`Usar capa de ${candidate.source ?? "fonte desconhecida"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={candidate.url}
                            alt=""
                            aria-hidden="true"
                            className="h-40 w-full object-contain"
                            loading="lazy"
                            onError={() =>
                              setFailedUrls((urls) =>
                                urls.includes(candidate.url)
                                  ? urls
                                  : [...urls, candidate.url],
                              )
                            }
                          />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4">
              <RPGUIButton type="button" title="Fechar" onClick={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
