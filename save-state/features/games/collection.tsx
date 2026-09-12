"use client";

import type { ReactNode } from "react";
import type { Pagination } from "@/features/shared/types";
import { CollectionPagination } from "./collection-pagination";

export type ViewMode = "grid" | "list";

export function Collection<T>({
  items,
  getItemKey,
  renderGridItem,
  renderListItem,
  listHeader,
  search,
  onSearchChange,
  searchPlaceholder = "Buscar jogo pelo nome…",
  viewMode,
  onViewModeChange,
  isLoading,
  error,
  onRetry,
  pagination,
  currentPage,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
  emptyMessage = "Nenhum jogo encontrado.",
}: {
  items: T[];
  getItemKey: (item: T) => string;
  renderGridItem: (item: T) => ReactNode;
  renderListItem: (item: T) => ReactNode;
  listHeader?: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  pagination: Pagination | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (perPage: number) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rpgui-input"
          type="search"
          value={search}
          placeholder={searchPlaceholder}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <button
          className={`rpgui-button ${viewMode === "grid" ? "down" : ""}`}
          type="button"
          onClick={() => onViewModeChange("grid")}
          aria-label="Ver em grade"
        >
          ▦
        </button>
        <button
          className={`rpgui-button ${viewMode === "list" ? "down" : ""}`}
          type="button"
          onClick={() => onViewModeChange("list")}
          aria-label="Ver em lista"
        >
          ☰
        </button>
      </div>
      {listHeader}
      {isLoading ? (
        <p>Carregando…</p>
      ) : error ? (
        <div className="rpgui-container framed-grey p-4">
          <p role="alert">{error}</p>
          <button className="rpgui-button" type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      ) : items.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {items.map((item) => (
            <div key={getItemKey(item)}>{renderGridItem(item)}</div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={getItemKey(item)}>{renderListItem(item)}</div>
          ))}
        </div>
      )}
      {pagination && (
        <CollectionPagination
          pagination={pagination}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange}
          onItemsPerPageChange={onItemsPerPageChange}
        />
      )}
    </div>
  );
}
