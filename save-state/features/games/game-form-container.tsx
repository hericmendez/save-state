"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { Game } from "@/features/shared/types";
import {
  EMPTY_GAME_FORM,
  GameForm,
  formToPayload,
  type GameFormState,
} from "@/features/games/game-form";
import { toPlainGame } from "@/features/games/mappers";

function gameToForm(game: Game): GameFormState {
  const meta = game.game;
  return {
    name: meta?.name ?? "",
    cover: meta?.cover ?? "",
    genres: (meta?.genres ?? []).join(", "),
    platforms: (meta?.platforms ?? []).join(", "),
    developers: (meta?.developers ?? []).join(", "),
    publishers: (meta?.publishers ?? []).join(", "),
    releaseDate: (meta?.releaseDate ?? "").slice(0, 10),
    summary: meta?.summary ?? "",
    status: game.status ?? "backlog",
    hoursPlayed: String(game.hoursPlayed ?? 0),
    timesFinished: String(game.timesFinished ?? 0),
    rating:
      game.rating === undefined || game.rating === null
        ? ""
        : String(game.rating),
    review: game.review ?? "",
    favorite: game.favorite ?? false,
    fullyCompleted: game.fullyCompleted ?? false,
    achievements: game.achievements ?? false,
    achievementProgress:
      game.achievementProgress === undefined || game.achievementProgress === null
        ? ""
        : String(game.achievementProgress),
  };
}

export function GameFormContainer({
  editingId,
  initialGame,
  attachListId,
}: {
  editingId?: string;
  initialGame?: Game;
  attachListId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<GameFormState>(() =>
    initialGame ? gameToForm(initialGame) : EMPTY_GAME_FORM,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(patch: Partial<GameFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      if (editingId) {
        const payload = formToPayload(form);
        // ATP snapshots are metadata-immutable (GAME_METADATA_IMMUTABLE):
        // send personal fields only so edits to imported games succeed.
        if (
          initialGame?.game?.source !== undefined &&
          initialGame.game.source !== "manual"
        ) {
          delete payload.game;
        }
        await apiRequest(`/api/games/${editingId}`, {
          method: "PUT",
          body: payload,
        });
        router.push("/backlog");
      } else {
        const created = await apiRequest<Game>("/api/games", {
          method: "POST",
          body: formToPayload(form),
        });
        const plain = toPlainGame(created);
        if (attachListId) {
          await apiRequest(
            `/api/games/${plain._id}/lists/${attachListId}`,
            { method: "POST" },
          );
        }
        router.push("/backlog");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Falha ao salvar");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">
          {editingId ? "Editar jogo" : "Novo jogo"}
        </h1>
      </header>
      <GameForm
        form={form}
        isEditing={Boolean(editingId)}
        isSubmitting={isSubmitting}
        error={error}
        onChange={patch}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        metadataLocked={
          Boolean(editingId) &&
          initialGame?.game?.source !== undefined &&
          initialGame.game.source !== "manual"
        }
      />
    </div>
  );
}
