"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { Game, GameCollection } from "@/features/shared/types";
import { CustomContextMenu, type ContextMenuItem } from "./context-menu";

async function addGameToCollection(gameId: string, collectionId: string): Promise<void> {
  await apiRequest<void>(`/api/games/${gameId}/collections/${collectionId}`, {
    method: "POST",
  });
}

async function removeGameFromCollection(gameId: string, collectionId: string): Promise<void> {
  await apiRequest<void>(`/api/games/${gameId}/collections/${collectionId}`, {
    method: "DELETE",
  });
}

export function GameContextMenu({
  game,
  collections,
  onDetails,
  onEdit,
  onDelete,
  onCollectionChanged,
  onError,
  children,
}: {
  game: Game;
  collections: GameCollection[];
  onDetails: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCollectionChanged?: () => void;
  onError?: (message: string) => void;
  children: React.ReactNode;
}) {
  const [localCollectionIds, setLocalCollectionIds] = useState<string[]>(game.collectionIds ?? []);
  // Favorite label follows the real UserGame state: updated by our own
  // toggle below and re-synced when the parent row changes (e.g. the
  // details modal favorited the same game). No parallel favorite state.
  const [favorite, setFavorite] = useState(game.favorite ?? false);
  const [favPending, setFavPending] = useState(false);

  useEffect(() => {
    if (!favPending) setFavorite(game.favorite ?? false);
  }, [game.favorite, favPending]);

  function reportError(err: unknown, fallback: string) {
    onError?.(err instanceof ApiRequestError ? err.message : fallback);
  }

  async function handleAdd(collectionId: string) {
    setLocalCollectionIds((ids) => [...ids, collectionId]);
    try {
      await addGameToCollection(game._id, collectionId);
      onCollectionChanged?.();
    } catch (err) {
      setLocalCollectionIds((ids) => ids.filter((id) => id !== collectionId));
      reportError(err, "Falha ao adicionar");
    }
  }

  async function handleRemove(collectionId: string) {
    const previous = localCollectionIds;
    setLocalCollectionIds((ids) => ids.filter((id) => id !== collectionId));
    try {
      await removeGameFromCollection(game._id, collectionId);
      onCollectionChanged?.();
    } catch (err) {
      setLocalCollectionIds(previous);
      reportError(err, "Falha ao remover");
    }
  }

  async function handleToggleFavorite() {
    // Double-click / repeated taps while pending are ignored: a single
    // PATCH decides the outcome, mirroring the details modal behavior.
    if (favPending) return;
    const next = !favorite;
    setFavPending(true);
    try {
      await apiRequest(`/api/games/${game._id}`, {
        method: "PATCH",
        body: { favorite: next },
      });
      setFavorite(next);
      onCollectionChanged?.();
    } catch (err) {
      reportError(err, "Falha ao favoritar");
    } finally {
      setFavPending(false);
    }
  }

  const currentCollections = useMemo(
    () => collections.filter((collection) => localCollectionIds.includes(collection._id)),
    [collections, localCollectionIds],
  );
  const availableCollections = useMemo(
    () => collections.filter((collection) => !localCollectionIds.includes(collection._id)),
    [collections, localCollectionIds],
  );

  const items: ContextMenuItem[] = [
    {
      key: "favorite",
      label: favPending ? "Aguarde…" : favorite ? "Desfavoritar" : "Favoritar",
      onClick: handleToggleFavorite,
      disabled: favPending,
    },
    { key: "details", label: "Ver detalhes", onClick: onDetails },
    ...(onEdit ? [{ key: "edit", label: "Editar", onClick: onEdit }] : []),
    ...(onDelete ? [{ key: "delete", label: "Excluir", onClick: onDelete }] : []),
    { key: "sep", separator: true },
    {
      key: "add",
      label: "Adicionar a…",
      children:
        availableCollections.length === 0
          ? [{ key: "add-empty", label: "(nenhuma coleção)" }]
          : availableCollections.map((collection) => ({
              key: `add-${collection._id}`,
              label: collection.name,
              onClick: () => handleAdd(collection._id),
            })),
    },
    {
      key: "remove",
      label: "Remover de…",
      children:
        currentCollections.length === 0
          ? [{ key: "remove-empty", label: "(em nenhuma coleção)" }]
          : currentCollections.map((collection) => ({
              key: `remove-${collection._id}`,
              label: collection.name,
              onClick: () => handleRemove(collection._id),
            })),
    },
  ];

  return <CustomContextMenu items={items}>{children}</CustomContextMenu>;
}
