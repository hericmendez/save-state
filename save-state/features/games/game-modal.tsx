"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { apiRequest } from "@/lib/api-client";
import type { Game } from "@/features/shared/types";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <strong>{label}:</strong> {value}
    </p>
  );
}

export function GameModal({
  game,
  onClose,
  onUpdated,
}: {
  game: Game | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [details, setDetails] = useState<Game | null>(game);
  const [error, setError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);

  useEffect(() => {
    setDetails(game);
    setError(null);
    if (!game) return;
    let cancelled = false;
    apiRequest<Game>(`/api/games/${game._id}`)
      .then((fresh) => {
        if (!cancelled) setDetails(fresh);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível atualizar os detalhes.");
      });
    return () => {
      cancelled = true;
    };
  }, [game]);

  useEffect(() => {
    if (!game) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previous;
    };
  }, [game, onClose]);

  if (typeof document === "undefined") return null;

  const shown = details ?? game;

  return createPortal(
    <AnimatePresence>
      {game && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
          onClick={onClose}
        >
          <motion.aside
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="rpgui-container framed-golden max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={shown?.game?.name ?? "Detalhes do jogo"}
          >
            {error && <p role="alert">{error}</p>}
            {shown && (
              <>
                <h2 className="font-display text-xl">
                  {shown.game?.name ?? "Jogo"}
                </h2>
                {(shown.game?.genres ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(shown.game?.genres ?? []).map((genre) => (
                      <span
                        key={genre}
                        className="rpgui-container framed-grey px-2 text-xs"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
                {shown.game?.summary && (
                  <p className="rpgui-text mt-3">{shown.game.summary}</p>
                )}
                <div className="mt-3 flex flex-col gap-1 text-sm">
                  {(shown.game?.platforms ?? []).length > 0 && (
                    <DetailRow
                      label="Plataformas"
                      value={(shown.game?.platforms ?? []).join(", ")}
                    />
                  )}
                  {(shown.game?.developers ?? []).length > 0 && (
                    <DetailRow
                      label="Desenvolvedoras"
                      value={(shown.game?.developers ?? []).join(", ")}
                    />
                  )}
                  {(shown.game?.publishers ?? []).length > 0 && (
                    <DetailRow
                      label="Publicadoras"
                      value={(shown.game?.publishers ?? []).join(", ")}
                    />
                  )}
                  {shown.status && (
                    <DetailRow label="Status" value={shown.status} />
                  )}
                  {typeof shown.hoursPlayed === "number" && (
                    <DetailRow
                      label="Horas jogadas"
                      value={String(shown.hoursPlayed)}
                    />
                  )}
                  <DetailRow
                    label="Vezes zerado"
                    value={String(shown.timesFinished ?? 0)}
                  />
                  {shown.finished && <DetailRow label="Zerado" value="Sim" />}
                  {shown.fullyCompleted && (
                    <DetailRow label="100% completo" value="Sim" />
                  )}
                  {shown.favorite && <DetailRow label="Favorito" value="★" />}
                  {shown.achievements ? (
                    <DetailRow
                      label="Conquistas"
                      value={
                        shown.achievementProgress !== null && shown.achievementProgress !== undefined
                          ? `${shown.achievementProgress}%${shown.achievementsCompleted ? " (100%)" : ""}`
                          : "0%"
                      }
                    />
                  ) : (
                    <DetailRow label="Conquistas" value="N/A" />
                  )}
                  {typeof shown.rating === "number" && (
                    <DetailRow label="Nota" value={String(shown.rating)} />
                  )}
                </div>
                {shown.review && (
                  <blockquote className="rpgui-container framed-grey mt-3 p-3">
                    {shown.review}
                  </blockquote>
                )}
              </>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rpgui-button"
                type="button"
                disabled={isFinishing || isTogglingFavorite}
                aria-busy={isFinishing}
                onClick={async () => {
                  if (!shown || isFinishing || isTogglingFavorite) return;
                  setIsFinishing(true);
                  setError(null);
                  try {
                    const updated = await apiRequest<Game>(
                      `/api/games/${shown._id}/finish`,
                      { method: "POST" },
                    );
                    setDetails(updated);
                    onUpdated?.();
                  } catch {
                    setError("Falha ao incrementar");
                  } finally {
                    setIsFinishing(false);
                  }
                }}
              >
                {isFinishing ? "Zerei +1…" : "Zerei +1"}
              </button>
              <button
                className="rpgui-button"
                type="button"
                disabled={isFinishing || isTogglingFavorite}
                aria-busy={isTogglingFavorite}
                onClick={async () => {
                  if (!shown || isFinishing || isTogglingFavorite) return;
                  setIsTogglingFavorite(true);
                  setError(null);
                  try {
                    const updated = await apiRequest<Game>(
                      `/api/games/${shown._id}`,
                      {
                        method: "PATCH",
                        body: { favorite: !shown.favorite },
                      },
                    );
                    setDetails(updated);
                    onUpdated?.();
                  } catch {
                    setError("Falha ao favoritar");
                  } finally {
                    setIsTogglingFavorite(false);
                  }
                }}
              >
                {isTogglingFavorite
                  ? "Aguarde…"
                  : shown?.favorite
                    ? "Desfavoritar"
                    : "Favoritar"}
              </button>
              <button className="rpgui-button" type="button" onClick={onClose}>
                Fechar
              </button>
              {(isFinishing || isTogglingFavorite) && (
                <span className="font-display text-xs" aria-live="polite">
                  [ Carregando... ]
                </span>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
