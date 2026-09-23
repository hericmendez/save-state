"use client";

import { useMemo } from "react";
import type { Pagination } from "@/features/shared/types";
import {
  COLLECTION_PAGE_SIZES,
  pageNumbers,
} from "@/features/collection/collection-query";
import RPGUIButton from "@/components/RPGUI/Button";

export function CollectionPagination({
  pagination,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: {
  pagination: Pagination;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (perPage: number) => void;
}) {
  const numbers = useMemo(
    () => pageNumbers(currentPage, pagination.totalPages),
    [currentPage, pagination.totalPages],
  );

  if (pagination.totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <RPGUIButton
        type="button"
        title="‹"
        disabled={!pagination.hasPreviousPage}
        onClick={() => onPageChange(currentPage - 1)}
      />
      {numbers.map((page, index) =>
        page === "…" ? (
          <span key={`ellipsis-${index}`}>…</span>
        ) : (
          <RPGUIButton
            key={page}
            type="button"
            title={String(page)}
            className={page === currentPage ? "down" : ""}
            onClick={() => onPageChange(page)}
          />
        ),
      )}
      <RPGUIButton
        type="button"
        title="›"
        disabled={!pagination.hasNextPage}
        onClick={() => onPageChange(currentPage + 1)}
      />
      <select
        className="rpgui-dropdown"
        value={itemsPerPage}
        onChange={(event) => onItemsPerPageChange(Number(event.target.value))}
        aria-label="Itens por página"
      >
        {COLLECTION_PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
}
