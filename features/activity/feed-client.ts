/**
 * Pure client-side feed helpers (no JSX, no hooks).
 *
 * Imported by `home-feed.tsx` and unit-tested directly: the repository
 * has no DOM test infrastructure by design, so component interaction is
 * verified manually while every pure rule lives here.
 */

import type { FeedItem } from "./grouping";

export interface FeedPageDTO {
  data: FeedItem[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export const FEED_PAGE_LIMIT = 10;

/** Browser timezone once; `"UTC"` fallback (no User field, no persistence). */
export function resolveTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof timeZone === "string" && timeZone.length > 0) return timeZone;
  } catch {
    // Fall through to UTC below.
  }
  return "UTC";
}

export function buildFeedUrl(
  limit: number,
  timeZone: string,
  cursor: string | null = null,
): string {
  const params = new URLSearchParams({
    limit: String(limit),
    timeZone,
  });
  if (cursor) params.set("cursor", cursor);
  return `/api/activity?${params.toString()}`;
}

/** Append-only merge: existing items are never replaced or reordered. */
export function appendFeedPage(
  current: FeedItem[],
  page: FeedPageDTO,
): { items: FeedItem[]; nextCursor: string | null; hasMore: boolean } {
  return {
    items: [...current, ...page.data],
    nextCursor: page.pagination.nextCursor,
    hasMore: page.pagination.hasMore,
  };
}
