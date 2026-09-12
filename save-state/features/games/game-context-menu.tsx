"use client";

import { useMemo, useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { Game, GameList } from "@/features/shared/types";
import { CustomContextMenu, type ContextMenuItem } from "./context-menu";

async function addGameToList(gameId: string, listId: string): Promise<void> {
  await apiRequest<void>(`/api/games/${gameId}/lists/${listId}`, {
    method: "POST",
  });
}

async function removeGameFromList(gameId: string, listId: string): Promise<void> {
  await apiRequest<void>(`/api/games/${gameId}/lists/${listId}`, {
    method: "DELETE",
  });
}

export function GameContextMenu({
  game,
  lists,
  onDetails,
  onEdit,
  onDelete,
  onListChanged,
  onError,
  children,
}: {
  game: Game;
  lists: GameList[];
  onDetails: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onListChanged?: () => void;
  onError?: (message: string) => void;
  children: React.ReactNode;
}) {
  const [localListIds, setLocalListIds] = useState<string[]>(game.listIds ?? []);

  function reportError(err: unknown, fallback: string) {
    onError?.(err instanceof ApiRequestError ? err.message : fallback);
  }

  async function handleAdd(listId: string) {
    setLocalListIds((ids) => [...ids, listId]);
    try {
      await addGameToList(game._id, listId);
      onListChanged?.();
    } catch (err) {
      setLocalListIds((ids) => ids.filter((id) => id !== listId));
      reportError(err, "Falha ao adicionar");
    }
  }

  async function handleRemove(listId: string) {
    const previous = localListIds;
    setLocalListIds((ids) => ids.filter((id) => id !== listId));
    try {
      await removeGameFromList(game._id, listId);
      onListChanged?.();
    } catch (err) {
      setLocalListIds(previous);
      reportError(err, "Falha ao remover");
    }
  }

  const currentLists = useMemo(
    () => lists.filter((list) => localListIds.includes(list._id)),
    [lists, localListIds],
  );
  const availableLists = useMemo(
    () => lists.filter((list) => !localListIds.includes(list._id)),
    [lists, localListIds],
  );

  const items: ContextMenuItem[] = [
    { key: "details", label: "Ver detalhes", onClick: onDetails },
    ...(onEdit ? [{ key: "edit", label: "Editar", onClick: onEdit }] : []),
    ...(onDelete ? [{ key: "delete", label: "Excluir", onClick: onDelete }] : []),
    { key: "sep", separator: true },
    {
      key: "add",
      label: "Adicionar a…",
      children:
        availableLists.length === 0
          ? [{ key: "add-empty", label: "(nenhuma lista)" }]
          : availableLists.map((list) => ({
              key: `add-${list._id}`,
              label: list.name,
              onClick: () => handleAdd(list._id),
            })),
    },
    {
      key: "remove",
      label: "Remover de…",
      children:
        currentLists.length === 0
          ? [{ key: "remove-empty", label: "(em nenhuma lista)" }]
          : currentLists.map((list) => ({
              key: `remove-${list._id}`,
              label: list.name,
              onClick: () => handleRemove(list._id),
            })),
    },
  ];

  return <CustomContextMenu items={items}>{children}</CustomContextMenu>;
}
