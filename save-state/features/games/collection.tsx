"use client";

import type { ReactNode } from "react";
import type { Pagination } from "@/features/shared/types";
import { CollectionPagination } from "./collection-pagination";
import RPGUIButton from "@/components/RPGUI/Button";
import { ViewModeToggle } from "@/features/collection/view-mode-toggle";
import type { CollectionViewMode } from "@/features/collection/collection-query";
import RPGUInput from "@/components/RPGUI/Input";

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
  viewMode: CollectionViewMode;
  onViewModeChange: (mode: CollectionViewMode) => void;
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
        <RPGUInput

          type="search"
          value={search}
          placeholder={searchPlaceholder}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
      </div>
      {listHeader}
      {isLoading ? (
        <div className="rpgui-container framed-grey p-4 text-center">
          <p className="font-display text-sm" aria-live="polite">
            [ Carregando... ]
          </p>
        </div>
      ) : error ? (
        <div className="rpgui-container framed-grey p-4">
          <p role="alert">{error}</p>
          <RPGUIButton type="button" title="Tentar novamente" onClick={onRetry} />
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
