"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { Game } from "@/features/shared/types";
import { GameDrawerShell } from "./game-drawer-shell";
import { UserGameDrawerContent } from "./user-game-drawer-content";

export function GameModal({
  game,
  onClose,
  onUpdated,
  autoFocusNotes = false,
}: {
  game: Game | null;
  onClose: () => void;
  onUpdated?: () => void;
  /** Focus the new-note field on open (e.g. when opened from a note activity). */
  autoFocusNotes?: boolean;
}) {
  const [details, setDetails] = useState<Game | null>(game);
  const [error, setError] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setDetails(game);
    setError(null);
    setCoverFailed(false);
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

  const shown = details ?? game;

  return (
    <GameDrawerShell open={!!game} title={shown?.game?.name ?? "Detalhes do jogo"} onClose={onClose}>
      {error && <p role="alert">{error}</p>}
      {shown && (
        <UserGameDrawerContent
          shown={shown}
          coverFailed={coverFailed}
          onCoverError={() => setCoverFailed(true)}
          autoFocusNotes={autoFocusNotes}
          onUpdated={onUpdated}
          onError={setError}
          setDetails={setDetails}
        />
      )}
    </GameDrawerShell>
  );
}
