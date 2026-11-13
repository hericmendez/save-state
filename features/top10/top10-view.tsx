"use client";

import { useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type {
  Game,
  PaginatedResponse,
} from "@/features/shared/types";
import { toPlainGame } from "@/features/games/mappers";
import { GameModal } from "@/features/games/game-modal";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUISelect from "@/components/RPGUI/Select";
import { FaEye } from "react-icons/fa6";

function gameName(game: Game): string {
  return game.game?.name ?? "Jogo";
}

export function Top10View({
  initialTop10,
  initialCandidates,
}: {
  initialTop10: Game[];
  initialCandidates: Game[];
}) {
  const [ordered, setOrdered] = useState<Game[]>(initialTop10);
  const [candidates, setCandidates] = useState<Game[]>(initialCandidates);
  const [selectedId, setSelectedId] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  function fail(message: string, err: unknown): void {
    setBanner(err instanceof ApiRequestError ? err.message : message);
  }

  async function refresh(): Promise<void> {
    setIsSaving(true);
    setBanner(null);
    try {
      const [top10, favorites] = await Promise.all([
        apiRequest<Game[]>("/api/top10"),
        apiRequest<PaginatedResponse<Game>>(
          "/api/games?favorite=true&page=1&limit=100",
        ),
      ]);
      const ranked = new Set(top10.map((game) => game._id));
      setOrdered(top10);
      setCandidates(
        favorites.data.map(toPlainGame).filter((game) => !ranked.has(game._id)),
      );
    } catch (err) {
      fail("Falha ao recarregar o Top 10", err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdd(): Promise<void> {
    if (!selectedId || isSaving) return;
    setIsSaving(true);
    setBanner(null);
    try {
      const next = await apiRequest<Game[]>(`/api/top10/${selectedId}`, {
        method: "POST",
      });
      const ranked = new Set(next.map((game) => game._id));
      setOrdered(next);
      setCandidates((previous) =>
        previous.filter((game) => !ranked.has(game._id)),
      );
      setSelectedId("");
    } catch (err) {
      fail("Falha ao adicionar ao Top 10", err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(game: Game): Promise<void> {
    if (isSaving) return;
    if (!window.confirm(`Remover "${gameName(game)}" do Top 10?`)) return;
    setIsSaving(true);
    setBanner(null);
    try {
      await apiRequest<void>(`/api/top10/${game._id}`, { method: "DELETE" });
      setOrdered((previous) =>
        previous.filter((entry) => entry._id !== game._id),
      );
      // Removing from the Top 10 never unfavorites: the game stays a
      // candidate because it still has `favorite === true`.
      setCandidates((previous) =>
        previous.some((entry) => entry._id === game._id)
          ? previous
          : [...previous, game],
      );
    } catch (err) {
      fail("Falha ao remover do Top 10", err);
    } finally {
      setIsSaving(false);
    }
  }

  async function persistOrder(next: Game[], rollback: Game[]): Promise<void> {
    setOrdered(next);
    setDragIndex(null);
    setDropIndex(null);
    setIsSaving(true);
    setBanner(null);
    try {
      const saved = await apiRequest<Game[]>("/api/top10", {
        method: "PATCH",
        body: { top10: next.map((game) => game._id) },
      });
      setOrdered(saved);
    } catch (err) {
      setOrdered(rollback);
      fail("Falha ao salvar a nova ordem", err);
    } finally {
      setIsSaving(false);
    }
  }

  function move(from: number, to: number): void {
    if (isSaving || from === to) return;
    if (from < 0 || to < 0 || from >= ordered.length || to >= ordered.length) {
      return;
    }
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistOrder(next, ordered);
  }

  function handleDrop(index: number): void {
    if (dragIndex === null) return;
    move(dragIndex, index);
  }

  const full = ordered.length >= 10;

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Meu Top 10</h1>
        <p className="text-sm">
          {ordered.length === 0
            ? "Sua lista está vazia. Adicione seus favoritos abaixo."
            : `${ordered.length} de 10 jogos no ranking.`}
        </p>
      </header>

      {banner && (
        <p role="alert" className="rpgui-container framed-grey p-3">
          {banner}
        </p>
      )}

      <section className="rpgui-container framed-grey p-4">
        <h2 className="font-display text-lg">Adicionar favorito</h2>
        {candidates.length === 0 ? (
          <p className="mt-2 text-sm">
            {full
              ? "Top 10 cheio! Remova um jogo para adicionar outro."
              : "Nenhum favorito fora do Top 10. Favorite um jogo para adicioná-lo aqui."}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RPGUISelect
              aria-label="Jogo favorito para adicionar"
              value={selectedId}
              disabled={isSaving || full}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Escolha um jogo…</option>
              {candidates.map((game) => (
                <option key={game._id} value={game._id}>
                  {gameName(game)}
                </option>
              ))}
            </RPGUISelect>
            <RPGUIButton
     
             title="Adicionar"
              disabled={!selectedId || isSaving || full}
              onClick={() => void handleAdd()}
            />

          </div>
        )}
      </section>

      <section className="rpgui-container framed-grey p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Ranking</h2>
          <RPGUIButton
          title="Recarregar"
            disabled={isSaving}
            onClick={() => void refresh()}
          />
        </div>

        {ordered.length === 0 ? (
          <p className="mt-2 text-sm">
            Nada por aqui ainda — seu Top 10 aparecerá nesta lista ordenada de
            #1 a #10.
          </p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {ordered.map((game, index) => (
              <li
                key={game._id}
                draggable={!isSaving}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropIndex(index);
                }}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                className={`flex items-center gap-3 p-2 ${
                  dropIndex === index && dragIndex !== null && dragIndex !== index
                    ? "rpgui-container framed-golden"
                    : "rpgui-container framed"
                }`}
              >
                <span
                  aria-label={`Posição ${index + 1}`}
                  className="font-display w-10 shrink-0 text-xl"
                >
                  #{index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-sm">
                    ★ {gameName(game)}
                  </span>
                  {game.game?.platforms && game.game.platforms.length > 0 && (
                    <span className="block truncate text-xs">
                      {game.game.platforms.join(", ")}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                                        className="rpgui-container framed-grey text-3xl font-display  [-webkit-text-stroke:0px_black] transition-all  hover:[-webkit-text-stroke:1px]"

                    disabled={isSaving}
                    onClick={() => setSelectedGame(game)}
                  >
                    <FaEye />

                  </button>
                  <button
                    type="button"
                    aria-label={`Mover ${gameName(game)} para cima`}
                    title="Mover para cima"
                    className="rpgui-container framed-grey text-3xl font-display  [-webkit-text-stroke:0px_black] transition-all  hover:[-webkit-text-stroke:1px]"
                    disabled={isSaving || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover ${gameName(game)} para baixo`}
                    title="Mover para baixo"
                    className="rpgui-container framed-grey text-3xl font-display  [-webkit-text-stroke:0px_black] transition-all  hover:[-webkit-text-stroke:1px]"
                    disabled={isSaving || index === ordered.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="rpgui-container framed-grey text-3xl font-display text-red-500! [-webkit-text-stroke:0px_black] transition-all  hover:[-webkit-text-stroke:1px]"

                    disabled={isSaving}
                    onClick={() => void handleRemove(game)}
                  >
                    X
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
        {ordered.length > 0 && (
          <p className="mt-2 text-xs">
            Arraste um item sobre outro para reordenar, ou use as setas ↑ ↓. A
            nova ordem é salva automaticamente.
          </p>
        )}
      </section>
      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onUpdated={() => void refresh()}
      />
    </div>
  );
}
