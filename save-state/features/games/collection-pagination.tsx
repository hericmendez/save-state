"use client";

import { useMemo } from "react";
import type { Pagination } from "@/features/shared/types";

const PAGE_SIZE_OPTIONS = [10, 20, 30];

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort(
    (a, b) => a - b,
  );
  const result: (number | "…")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) result.push("…");
    result.push(page);
    previous = page;
  }
  return result;
}

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
      <button
        className="rpgui-button"
        type="button"
        disabled={!pagination.hasPreviousPage}
        onClick={() => onPageChange(currentPage - 1)}
      >
        ‹
      </button>
      {numbers.map((page, index) =>
        page === "…" ? (
          <span key={`ellipsis-${index}`}>…</span>
        ) : (
          <button
            key={page}
            className={`rpgui-button ${page === currentPage ? "down" : ""}`}
            type="button"
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ),
      )}
      <button
        className="rpgui-button"
        type="button"
        disabled={!pagination.hasNextPage}
        onClick={() => onPageChange(currentPage + 1)}
      >
        ›
      </button>
      <select
        className="rpgui-dropdown"
        value={itemsPerPage}
        onChange={(event) => onItemsPerPageChange(Number(event.target.value))}
        aria-label="Itens por página"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
}
