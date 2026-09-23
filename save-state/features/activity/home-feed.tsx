"use client";

/**
 * Real Activity Feed data layer for the Home (E2.2).
 *
 * ```text
 * Home (server, no fetching)
 *   ↓
 * HomeFeed (client)
 *   ↓ GET /api/activity (apiRequest, the project's existing helper)
 *   ↓
 * ActivityFeed (pure rendering, unchanged behavior)
 * ```
 *
 * Rules enforced here:
 * - Timezone resolved once per mount and frozen for every page.
 * - Cursor treated as opaque: stored, resent, never decoded or advanced
 *   on error.
 * - Pages are append-only; a failed "load more" keeps existing items.
 * - At most one pagination request in flight (ref guard + disabled UI).
 * - API FeedItems are NEVER regrouped (`groupActivities` is preview-only).
 * - `apiRequest` has no AbortController support, so unmount safety uses a
 *   local cancelled flag (documented limitation, no infra change).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { Game } from "@/features/shared/types";
import { GameModal } from "@/features/games/game-modal";
import {
  ActivityFeed,
  FeedEmpty,
  FeedError,
  FeedLoading,
} from "./activity-feed";
import {
  appendFeedPage,
  buildFeedUrl,
  FEED_PAGE_LIMIT,
  resolveTimeZone,
  type FeedPageDTO,
} from "./feed-client";
import type { FeedItem } from "./grouping";

export type { FeedPageDTO };

type InitialStatus = "loading" | "ready" | "error";

export function HomeFeed({ limit = FEED_PAGE_LIMIT }: { limit?: number }) {
  // Fixed for the feed lifetime: every page uses the same timezone.
  const [timeZone] = useState<string>(resolveTimeZone);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<InitialStatus>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // GameModal opened from an "Abrir jogo" activity action.
  const [openGame, setOpenGame] = useState<Game | null>(null);
  const [openAutoFocusNotes, setOpenAutoFocusNotes] = useState(false);
  const [openingGame, setOpeningGame] = useState(false);
  const [openGameError, setOpenGameError] = useState<string | null>(null);
  // Synchronous guard: state alone cannot stop two clicks in one frame.
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function initial() {
      setStatus("loading");
      try {
        const page = await apiRequest<FeedPageDTO>(
          buildFeedUrl(limit, timeZone),
        );
        if (cancelled) return;
        setItems(page.data);
        setNextCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void initial();
    return () => {
      cancelled = true;
    };
  }, [limit, timeZone]);

  async function retryFirst(): Promise<void> {
    setStatus("loading");
    try {
      const page = await apiRequest<FeedPageDTO>(
        buildFeedUrl(limit, timeZone),
      );
      setItems(page.data);
      setNextCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMoreRef.current || loadingMore || !hasMore || !nextCursor) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    // The pending cursor is captured here; errors never advance it.
    const cursor = nextCursor;
    try {
      const page = await apiRequest<FeedPageDTO>(
        buildFeedUrl(limit, timeZone, cursor),
      );
      const merged = appendFeedPage(items, page);
      setItems(merged.items);
      setNextCursor(merged.nextCursor);
      setHasMore(merged.hasMore);
    } catch {
      setLoadMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  /**
   * Opens the game behind an activity. Note activities land directly on
   * the Notes section (`autoFocusNotes`); every other type opens the
   * standard detail modal. The lookup is snapshot-based: the member type
   * decides, never a live fetch of notes.
   */
  async function openGameFromActivity(userGameId: string): Promise<void> {
    if (openingGame) return;
    const member = items
      .flatMap((item) => item.members)
      .find((event) => event.userGameId === userGameId);
    setOpenAutoFocusNotes(member?.type === "note.created");
    setOpeningGame(true);
    setOpenGameError(null);
    try {
      const game = await apiRequest<Game>(
        `/api/games/${encodeURIComponent(userGameId)}`,
      );
      setOpenGame(game);
    } catch (error) {
      setOpenGameError(
        error instanceof ApiRequestError
          ? error.message
          : "Não foi possível abrir o jogo.",
      );
    } finally {
      setOpeningGame(false);
    }
  }

  return (
    <>
      <h2 className="font-display mb-2 text-xl">Atividade recente</h2>
      {openGameError && (
        <p role="alert" className="rpgui-container framed-grey p-3 text-sm">
          {openGameError}
        </p>
      )}
      {status === "loading" && <FeedLoading />}
      {status === "error" && <FeedError onRetry={() => void retryFirst()} />}
      {status === "ready" && items.length === 0 && <FeedEmpty />}
      {status === "ready" && items.length > 0 && (
        <ActivityFeed
          items={items}
          timeZone={timeZone}
          onOpenGame={(userGameId) => void openGameFromActivity(userGameId)}
          footer={
            <>
              {loadMoreError && (
                <div className="rpgui-container framed p-3">
                  <p role="alert" className="text-sm">
                    Não foi possível carregar mais atividades.
                  </p>
                  <button
                    type="button"
                    className="rpgui-button mt-2"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
              {hasMore && !loadMoreError && (
                <button
                  type="button"
                  className="rpgui-button mt-2 self-start"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Carregando…" : "Carregar mais"}
                </button>
              )}
            </>
          }
        />
      )}
      {openingGame && (
        <p className="text-sm" aria-busy="true" aria-live="polite">
          [ Carregando... ]
        </p>
      )}
      <GameModal
        game={openGame}
        autoFocusNotes={openAutoFocusNotes}
        onClose={() => setOpenGame(null)}
      />
      <p className="mt-2 text-sm">
        <Link href="/diary" className="underline">
          Ver diário completo →
        </Link>
      </p>
    </>
  );
}
