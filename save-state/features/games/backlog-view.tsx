"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type {
  Game,
  GameList,
  Pagination,
} from "@/features/shared/types";
import type { CollectionQuery } from "@/features/collection/collection-query";
import { Collection } from "./collection";
import { GameCard } from "./game-card";
import { GameListItem } from "./game-list-item";
import { GameModal } from "./game-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { UserGameFilters } from "./user-game-filters";
import { hasActiveLibraryFilters } from "./user-game-query";
import { useUserGameCollection } from "./use-user-game-collection";

export function BacklogView({
  initialGames,
  initialPagination,
  initialQuery,
  lists,
  listId,
  listName,
  favorite,
  withoutList,
  emptyMessage = "Nenhum jogo encontrado.",
}: {
  initialGames: Game[];
  initialPagination: Pagination;
  initialQuery: CollectionQuery;
  lists: GameList[];
  listId?: string;
  listName?: string;
  favorite?: boolean;
  withoutList?: boolean;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const {
    query,
    searchInput,
    setSearchInput,
    updateQuery,
    updateFilters,
    filterDraft,
    games,
    pagination,
    isLoading,
    error,
    refresh,
    retry,
  } = useUserGameCollection({
    initialQuery,
    initialGames,
    initialPagination,
    scope: { favorite, withoutList, listId },
  });

  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function handleDelete() {
    if (!deleteTarget || isDeleting) return;
    const target = deleteTarget;
    setIsDeleting(true);
    try {
      await apiRequest<void>(`/api/games/${target._id}`, {
        method: "DELETE",
      });
      setDeleteTarget(null);
      if (selectedGame?._id === target._id) setSelectedGame(null);
      refresh();
    } catch (err) {
      setBanner(
        err instanceof ApiRequestError ? err.message : "Falha ao excluir",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">{listName ?? "Jogos"}</h1>
      </header>
      {banner && (
        <p role="alert" className="rpgui-container framed-grey p-3">
          {banner}
        </p>
      )}
      <UserGameFilters draft={filterDraft} onChange={updateFilters} />
      <Collection
        items={games}
        getItemKey={(game) => game._id}
        renderGridItem={(game) => (
          <GameCard
            game={game}
            lists={lists}
            onDetails={() => setSelectedGame(game)}
            onEdit={() => router.push(`/backlog/${game._id}/edit`)}
            onDelete={() => setDeleteTarget(game)}
            onListChanged={() => refresh()}
            onError={setBanner}
          />
        )}
        renderListItem={(game) => (
          <GameListItem
            game={game}
            lists={lists}
            onDetails={() => setSelectedGame(game)}
            onEdit={() => router.push(`/backlog/${game._id}/edit`)}
            onDelete={() => setDeleteTarget(game)}
            onListChanged={() => refresh()}
            onError={setBanner}
          />
        )}
        search={searchInput}
        onSearchChange={setSearchInput}
        viewMode={query.viewMode}
        onViewModeChange={(mode) => updateQuery({ viewMode: mode }, false)}
        isLoading={isLoading}
        error={error}
        onRetry={retry}
        emptyMessage={
          hasActiveLibraryFilters(query)
            ? "Nenhum jogo corresponde aos filtros."
            : emptyMessage
        }
        pagination={pagination}
        currentPage={query.page}
        onPageChange={(page) => updateQuery({ page }, false)}
        itemsPerPage={query.limit}
        onItemsPerPageChange={(limit) => updateQuery({ limit })}
      />
      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onUpdated={() => refresh()}
      />
      {deleteTarget && (
        <ConfirmDialog
          title="Excluir jogo"
          message={`Remover "${deleteTarget.game?.name ?? "este jogo"}" da sua biblioteca? O jogo global será preservado.`}
          confirmLabel="Excluir"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => !isDeleting && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
