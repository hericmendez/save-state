"use client";

import RPGUIButton from "@/components/RPGUI/Button";
import type { Game } from "@/features/shared/types";
import { GameNotesSection } from "./notes-section";
import { getStatusLabel } from "./status-labels";
import { apiRequest } from "@/lib/api-client";
import { useState } from "react";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <strong>{label}:</strong> {value}
    </p>
  );
}

function GameCover({
  name,
  url,
  failed,
  onError,
}: {
  name?: string | null;
  url?: string | null;
  failed: boolean;
  onError: () => void;
}) {
  if (!url) return null;
  if (failed) {
    return (
      <div
        className="rpgui-container framed-grey flex h-60 w-44 shrink-0 items-center justify-center sm:h-72 sm:w-56"
        aria-hidden="true"
      >
        <span className="font-display text-2xl">{(name ?? "?").charAt(0).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className="w-44 shrink-0 sm:w-56">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        aria-hidden="true"
        className="rpgui-container framed-grey h-auto max-h-[26rem] w-full object-contain p-1 shadow-2xl"
        onError={onError}
      />
    </div>
  );
}

export function UserGameDrawerContent({
  shown,
  coverFailed,
  onCoverError,
  autoFocusNotes,
  onUpdated,
  onError,
  setDetails,
}: {
  shown: Game;
  coverFailed: boolean;
  onCoverError: () => void;
  autoFocusNotes: boolean;
  onUpdated?: () => void;
  onError: (msg: string | null) => void;
  setDetails: (game: Game) => void;
}) {
  const [isFinishing, setIsFinishing] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);

  return (
    <>
      <header className="relative -m-6 mb-6 min-h-[340px] overflow-hidden sm:min-h-[420px]">
        {shown.game?.cover && !coverFailed && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown.game.cover}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" aria-hidden="true" />
          </>
        )}
        <div className="relative flex flex-col gap-4 p-6 pt-2 sm:flex-row">
          <GameCover name={shown.game?.name} url={shown.game?.cover} failed={coverFailed} onError={onCoverError} />
          <div className="min-w-0 flex-1">
            {(shown.game?.genres ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(shown.game?.genres ?? []).map((genre) => (
                  <span key={genre} className="rpgui-container framed-grey px-2 text-xs">
                    {genre}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-col gap-1 text-sm">
              {(shown.game?.platforms ?? []).length > 0 && (
                <DetailRow label="Plataformas" value={(shown.game?.platforms ?? []).join(", ")} />
              )}
              {(shown.game?.developers ?? []).length > 0 && (
                <DetailRow label="Desenvolvedoras" value={(shown.game?.developers ?? []).join(", ")} />
              )}
              {(shown.game?.publishers ?? []).length > 0 && (
                <DetailRow label="Publicadoras" value={(shown.game?.publishers ?? []).join(", ")} />
              )}
            </div>
            {shown.game?.summary && <p className="rpgui-text mt-2 text-sm">{shown.game.summary}</p>}
          </div>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section aria-label="Sua jornada">
          <h3 className="font-display text-lg">Sua jornada</h3>
          <div className="mt-2 flex flex-col gap-1 text-sm">
            {shown.status && <DetailRow label="Status" value={getStatusLabel(shown.status)} />}
            {typeof shown.hoursPlayed === "number" && <DetailRow label="Horas jogadas" value={String(shown.hoursPlayed)} />}
            <DetailRow label="Vezes zerado" value={String(shown.timesFinished ?? 0)} />
            {shown.finished && <DetailRow label="Zerado" value="Sim" />}
            {shown.fullyCompleted && <DetailRow label="100% completo" value="Sim" />}
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
            {typeof shown.rating === "number" && <DetailRow label="Nota" value={String(shown.rating)} />}
          </div>
        </section>
        <section aria-label="Sua avaliação">
          <h3 className="font-display text-lg">Sua avaliação</h3>
          {shown.reviewExcerpt ? (
            <blockquote className="rpgui-container framed-grey mt-2 p-3">{shown.reviewExcerpt}</blockquote>
          ) : (
            <p className="mt-2 text-sm opacity-70">Sem review por enquanto.</p>
          )}
        </section>
      </div>
      <GameNotesSection userGameId={shown._id} autoFocusNew={autoFocusNotes} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RPGUIButton
          type="button"
          title={isFinishing ? "Zerei +1…" : "Zerei +1"}
          disabled={isFinishing || isTogglingFavorite}
          aria-busy={isFinishing}
          onClick={async () => {
            if (isFinishing || isTogglingFavorite) return;
            setIsFinishing(true);
            onError(null);
            try {
              const updated = await apiRequest<Game>(`/api/games/${shown._id}/finish`, { method: "POST" });
              setDetails(updated);
              onUpdated?.();
            } catch {
              onError("Falha ao incrementar");
            } finally {
              setIsFinishing(false);
            }
          }}
        />
        <RPGUIButton
          type="button"
          title={isTogglingFavorite ? "Aguarde…" : shown.favorite ? "Desfavoritar" : "Favoritar"}
          disabled={isFinishing || isTogglingFavorite}
          aria-busy={isTogglingFavorite}
          onClick={async () => {
            if (isFinishing || isTogglingFavorite) return;
            setIsTogglingFavorite(true);
            onError(null);
            try {
              const updated = await apiRequest<Game>(`/api/games/${shown._id}`, {
                method: "PATCH",
                body: { favorite: !shown.favorite },
              });
              setDetails(updated);
              onUpdated?.();
            } catch {
              onError("Falha ao favoritar");
            } finally {
              setIsTogglingFavorite(false);
            }
          }}
        />
        {(isFinishing || isTogglingFavorite) && (
          <span className="font-display text-xs" aria-live="polite">
            [ Carregando... ]
          </span>
        )}
      </div>
    </>
  );
}
