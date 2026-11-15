"use client";

import { useRef, useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import {
  atpDetailToFormPatch,
  type AtpDetailForForm,
} from "@/features/games/metadata-search";
import {
  igdbDetailEndpoint,
  igdbSearchEndpoint,
} from "@/features/search/search-endpoints";
import type { GameFormState } from "@/features/games/game-form";
import RPGUInput from "@/components/RPGUI/Input";
interface SearchCard {
  atpId: string;
  name: string;
  year: number | null;
  platforms: string[];
  genres: string[];
}

interface SearchPage {
  data: SearchCard[];
}

type Step =
  | { kind: "results"; cards: SearchCard[] }
  | { kind: "preview"; detail: AtpDetailForForm };

/**
 * Metadata lookup for the game form. Always queries IGDB directly
 * (Etapa 5 — independent of SEARCH_METHOD), shows results, previews
 * one entry, and applies it as a form patch only on explicit
 * confirmation. Never writes silently. Manual entry stays possible
 * without any external lookup.
 */
export function GameMetadataSearch({
  query,
  onApply,
}: {
  query: string;
  onApply: (patch: Partial<GameFormState>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState(query);
  const [step, setStep] = useState<Step | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  function openDialog() {
    setSearchText(query);
    setStep(null);
    setError(null);
    setOpen(true);
  }

  async function runSearch(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      // Novo Jogo metadata lookup always uses IGDB directly,
      // independent of the catalog SEARCH_METHOD.
      const params = new URLSearchParams({ q: trimmed, limit: "5" });
      const page = await apiRequest<SearchPage>(igdbSearchEndpoint(params.toString()));
      if (requestId !== requestIdRef.current) return;
      setStep({ kind: "results", cards: page.data });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiRequestError ? err.message : "Falha na busca");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  async function runPreview(atpId: string) {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const detail = await apiRequest<AtpDetailForForm>(
        igdbDetailEndpoint(atpId),
      );
      if (requestId !== requestIdRef.current) return;
      setStep({ kind: "preview", detail });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof ApiRequestError ? err.message : "Falha ao carregar");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }

  return (
    <>
      <RPGUIButton type="button" title="Pesquisar" onClick={openDialog} />
      {open && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pesquisar metadados do jogo"
        >
          <div className="rpgui-container framed-golden max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
            <h2 className="font-display text-xl">Pesquisar metadados</h2>
            {/* NOTE: plain div + onClick, not a nested <form>: this dialog
                renders inside GameForm's <form> and nested forms would
                submit the outer form instead. */}
            <div className="mt-3 flex gap-2">
              <RPGUInput
                className=" flex-1"
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
            {step?.kind === "results" && (
              <div className="mt-3 flex flex-col gap-2">
                {step.cards.length === 0 ? (
                  <p>Nenhum jogo encontrado.</p>
                ) : (
                  step.cards.map((card) => (
                    <a
                      key={card.atpId}
                      type="button"
                      title={card.name}
                      className="w-full text-left rpgui-container framed-grey  hover:text-yellow-300 hover:underline "
                      onClick={() => void runPreview(card.atpId)}
                    >
                    {card.name}  {card.year !== null ? ` (${card.year})` : ""}
                    </a>
                  ))
                )}
              </div>
            )}
            {step?.kind === "preview" && (
              <div className="mt-3 flex flex-col gap-1 text-sm">
                <p>
                  <strong>{step.detail.name}</strong>
                </p>
                {step.detail.genres.length > 0 && (
                  <p>Gêneros: {step.detail.genres.join(", ")}</p>
                )}
                {step.detail.platforms.length > 0 && (
                  <p>Plataformas: {step.detail.platforms.join(", ")}</p>
                )}
                {step.detail.developers.length > 0 && (
                  <p>Desenvolvedoras: {step.detail.developers.join(", ")}</p>
                )}
                {step.detail.publishers.length > 0 && (
                  <p>Publicadoras: {step.detail.publishers.join(", ")}</p>
                )}
                {!step.detail.coverUrl && (
                  <p>Sem capa disponível nesta fonte.</p>
                )}
                <p className="mt-2">
                  Aplicar substitui os campos de metadados do formulário.
                </p>
                <div className="mt-2 flex gap-2">
                  <RPGUIButton
                    type="button"
                    title="Aplicar"
                    onClick={() => {
                      onApply(atpDetailToFormPatch(step.detail));
                      setOpen(false);
                    }}
                  />
                  <RPGUIButton
                    type="button"
                    title="Voltar"
                    onClick={() => void runSearch(searchText)}
                  />
                </div>
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
