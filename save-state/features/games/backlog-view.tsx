"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type {
  Game,
  GameList,
  PaginatedResponse,
  Pagination,
} from "@/features/shared/types";
import { toPlainGame } from "./mappers";
import {
  Collection,
  type ViewMode,
} from "./collection";
import { GameCard } from "./game-card";
import { GameListItem } from "./game-list-item";
import { GameModal } from "./game-modal";
import { ConfirmDialog } from "./confirm-dialog";

function useDebouncedValue(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function BacklogView({
  initialGames,
  initialPagination,
  lists,
  listId,
  listName,
  favorite,
}: {
  initialGames: Game[];
  initialPagination: Pagination;
  lists: GameList[];
  listId?: string;
  listName?: string;
  favorite?: boolean;
}) {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>(initialGames);
  const [pagination, setPagination] = useState<Pagination | null>(
    initialPagination,
  );
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());
  const firstLoad = useRef(true);

  const fetchGames = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(perPage),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (listId) params.set("listId", listId);
      if (favorite) params.set("favorite", "true");
      const result = await apiRequest<PaginatedResponse<Game>>(
        `/api/games?${params.toString()}`,
      );
      setGames(result.data.map(toPlainGame));
      setPagination(result.pagination);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Falha ao carregar jogos",
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, perPage, debouncedSearch, listId, favorite]);

  useEffect(() => {
    // Initial payload comes from the server; refetch on interaction or retry.
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    fetchGames();
  }, [fetchGames, reloadKey]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, perPage]);

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
      router.refresh();
      await fetchGames();
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
        <h1 className="font-display text-2xl">{listName ?? "Meus jogos"}</h1>
      </header>
      {banner && (
        <p role="alert" className="rpgui-container framed-grey p-3">
          {banner}
        </p>
      )}
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
            onListChanged={() => fetchGames()}
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
            onListChanged={() => fetchGames()}
            onError={setBanner}
          />
        )}
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isLoading={isLoading}
        error={error}
        onRetry={() => setReloadKey((key) => key + 1)}
        pagination={pagination}
        currentPage={page}
        onPageChange={setPage}
        itemsPerPage={perPage}
        onItemsPerPageChange={setPerPage}
      />
      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onUpdated={() => fetchGames()}
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
