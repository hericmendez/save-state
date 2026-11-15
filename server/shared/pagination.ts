/**
 * Domain-free pagination primitives.
 *
 * These describe the *envelope* shared by every future collection endpoint
 * (`{ data, pagination }`), not any particular domain's filters. Domain
 * filter schemas arrive with their own phases and should extend
 * `paginationQuerySchema` rather than reinvent page/limit handling.
 */

import "server-only";
import { z } from "zod";

export const MAX_PAGE_LIMIT = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

/** Build the `{ data, pagination }` envelope from a full result count. */
export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / query.limit);
  return {
    data: items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  };
}

/** Derive MongoDB-style `skip` for the current page. */
export function pageOffset(query: PaginationQuery): number {
  return (query.page - 1) * query.limit;
}
