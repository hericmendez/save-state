"use client";

import { useMemo } from "react";
import type { Pagination } from "@/features/shared/types";
import {
  COLLECTION_PAGE_SIZES,
  pageNumbers,
} from "@/features/collection/collection-query";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUISelect from "@/components/RPGUI/Select";
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
    <div className="flex flex-wrap items-center gap-2 font-display">
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
          <button
            key={page}
            type="button"
            title={String(page)}
            className={`rpgui-container ${page === currentPage ? "framed-grey" : ""}  px-2 py-1 text-sm`}
            onClick={() => onPageChange(page)}
          >
            {String(page)}
          </button>
        ),
      )}
      <RPGUIButton
        type="button"
        title="›"
        disabled={!pagination.hasNextPage}
        onClick={() => onPageChange(currentPage + 1)}
      />
      <RPGUISelect

        value={itemsPerPage}
        onChange={(event) => onItemsPerPageChange(Number(event.target.value))}
        aria-label="Itens por página"
      >
        {COLLECTION_PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </RPGUISelect>
    </div>
  );
}
