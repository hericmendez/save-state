"use client";

import { useEffect, useState } from "react";
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
import { notifyCollectionsChanged } from "@/features/collections/collections-signal";
import {
  atpDetailToFormPatch,
  type AtpDetailForForm,
} from "@/features/games/metadata-search";
import { igdbDetailEndpoint } from "@/features/search/search-endpoints";

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
  attachCollectionId,
  initialExternalId,
}: {
  editingId?: string;
  initialGame?: Game;
  attachCollectionId?: string;
  // "Edit and add" mode (Busca Geral → /backlog/new?externalId=…): loads
  // full IGDB metadata, locks it read-only, and submits through the IGDB
  // import (snapshot + all personal fields) instead of manual creation.
  // Absent = unchanged manual flow. Ignored when editing.
  initialExternalId?: string;
}) {
  const router = useRouter();
  // Blank (?externalId=) or whitespace-only values fall back to manual.
  const normalizedExternalId =
    initialExternalId !== undefined && initialExternalId.trim() !== ""
      ? initialExternalId.trim()
      : undefined;
  const externalMode = !editingId && normalizedExternalId !== undefined;
  const [form, setForm] = useState<GameFormState>(() =>
    initialGame ? gameToForm(initialGame) : EMPTY_GAME_FORM,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalLoading, setExternalLoading] = useState(externalMode);
  const [externalFailed, setExternalFailed] = useState(false);
  const [externalId, setExternalId] = useState<string | null>(null);
  // UserGame id of a completed import in this mount. Lets a failed
  // collection attach retry without re-running the import.
  const [createdUserGameId, setCreatedUserGameId] = useState<string | null>(
    null,
  );

  // Load-once IGDB detail for external mode. Personal fields keep their
  // manual defaults; metadata arrives locked and is never user-editable.
  useEffect(() => {
    if (!externalMode || initialGame) return;
    let cancelled = false;
    setExternalLoading(true);
    setExternalFailed(false);
    setError(null);
    apiRequest<AtpDetailForForm & { id: string }>(
      igdbDetailEndpoint(normalizedExternalId as string),
    )
      .then((detail) => {
        if (cancelled) return;
        setForm({
          ...EMPTY_GAME_FORM,
          ...atpDetailToFormPatch({ ...detail, atpId: detail.id }),
        });
        setExternalId(detail.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setExternalFailed(true);
        setError(
          err instanceof ApiRequestError ? err.message : "Falha ao carregar",
        );
      })
      .finally(() => {
        if (!cancelled) setExternalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [externalMode, normalizedExternalId, initialGame]);

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
      } else if (externalMode) {
        // IGDB import: the server owns the snapshot (source "igdb",
        // immutable metadata); the client only supplies identity + the
        // nine personal fields. Metadata inputs are locked, never trusted.
        // Import and collection attach are separate steps: a stored
        // UserGame id lets a failed attach retry without re-importing.
        if (!externalId) {
          setError(
            externalFailed
              ? "Não foi possível carregar os dados do catálogo. Volte à Busca Geral e tente novamente."
              : "Metadados ainda carregando. Aguarde e tente de novo.",
          );
          return;
        }
        let userGameId = createdUserGameId;
        if (!userGameId) {
          const { game: _omitted, ...personal } = formToPayload(form);
          try {
            const created = await apiRequest<Game>("/api/search/import", {
              method: "POST",
              body: {
                externalId,
                personal,
                conflictPolicy: "reject-existing",
              },
            });
            userGameId = toPlainGame(created)._id;
            setCreatedUserGameId(userGameId);
          } catch (err) {
            // Personal edits stay in the form; nothing was persisted.
            setError(
              err instanceof ApiRequestError ? err.message : "Falha ao salvar",
            );
            return;
          }
        }
        if (attachCollectionId) {
          try {
            await apiRequest(
              `/api/games/${userGameId}/collections/${attachCollectionId}`,
              { method: "POST" },
            );
            notifyCollectionsChanged();
          } catch {
            setError(
              "Jogo adicionado ao Backlog, mas a associação à coleção falhou. Tente novamente para concluir a associação.",
            );
            return;
          }
        }
        router.push("/backlog");
      } else {
        const created = await apiRequest<Game>("/api/games", {
          method: "POST",
          body: formToPayload(form),
        });
        const plain = toPlainGame(created);
        if (attachCollectionId) {
          await apiRequest(
            `/api/games/${plain._id}/collections/${attachCollectionId}`,
            { method: "POST" },
          );
          notifyCollectionsChanged();
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
      {externalLoading ? (
        <div className="rpgui-container framed-grey p-4 text-center">
          <p className="font-display text-sm" aria-live="polite">
            [ Carregando dados do catálogo... ]
          </p>
        </div>
      ) : null}
      <GameForm
        form={form}
        isEditing={Boolean(editingId)}
        isSubmitting={isSubmitting}
        error={error}
        onChange={patch}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        metadataLocked={
          (Boolean(editingId) &&
            initialGame?.game?.source !== undefined &&
            initialGame.game.source !== "manual") ||
          externalMode
        }
      />
    </div>
  );
}
