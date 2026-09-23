"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import { useDebouncedValue } from "@/features/collection/use-debounced-value";
import {
  ActivityFeed,
  FeedEmpty,
  FeedError,
  FeedLoading,
} from "@/features/activity/activity-feed";
import { appendFeedPage, type FeedPageDTO } from "@/features/activity/feed-client";
import type { FeedItem } from "@/features/activity/grouping";
import { formatDayHeading } from "@/features/activity/presentation";
import { GameModal } from "@/features/games/game-modal";
import type {
  Game,
  PaginatedResponse,
} from "@/features/shared/types";
import {
  DIARY_DEFAULTS,
  DIARY_LIMITS,
  DIARY_TYPE_LABELS,
  hasActiveDiaryFilters,
  parseDiaryQuery,
  serializeDiaryQuery,
  withoutCursor,
  type DiaryQuery,
} from "./diary-query";

interface DiaryPage extends FeedPageDTO {}

interface GameOption {
  id: string;
  name: string;
}

function toApiParams(query: DiaryQuery, timeZone: string): string {
  const params = new URLSearchParams({
    limit: String(query.limit),
    timeZone,
  });
  if (query.q !== "") params.set("q", query.q);
  if (query.userGameId !== "") params.set("gameId", query.userGameId);
  if (query.type !== "") params.set("type", query.type);
  if (query.from !== "") params.set("from", query.from);
  // `to` is an inclusive calendar day; the API bound is an instant.
  if (query.to !== "") params.set("to", `${query.to}T23:59:59.999`);
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}

function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = day(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const days = preset === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - (days - 1) * 86_400_000);
  return { from: day(from), to: today };
}

const PRESETS = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "today", label: "Hoje" },
  { value: "year", label: "Este ano" },
] as const;

export function DiaryView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  );

  const [query, setQuery] = useState<DiaryQuery>(() =>
    parseDiaryQuery(searchParams),
  );
  const [qInput, setQInput] = useState(() => parseDiaryQuery(searchParams).q);
  const [gameSearch, setGameSearch] = useState("");
  const [gameOptions, setGameOptions] = useState<GameOption[]>([]);
  const [gameLabel, setGameLabel] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openGame, setOpenGame] = useState<Game | null>(null);
  const [openAutoFocusNotes, setOpenAutoFocusNotes] = useState(false);

  const queryRef = useRef(query);
  queryRef.current = query;
  const abortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const firstLoad = useRef(true);

  const debouncedQ = useDebouncedValue(qInput.trim(), 350);
  const debouncedGameSearch = useDebouncedValue(gameSearch.trim(), 350);

  const commitToUrl = useCallback(
    (next: DiaryQuery) => {
      const { cursor: _drop, ...urlQuery } = next;
      const serialized = serializeDiaryQuery(urlQuery);
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname],
  );

  const fetchPage = useCallback(
    async (next: DiaryQuery, cursor: string | null, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!append) {
        setStatus("loading");
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const page = await apiRequest<DiaryPage>(
          `/api/activity?${toApiParams({ ...next, cursor: cursor ?? undefined }, timeZone)}`,
          { signal: controller.signal },
        );
        if (abortRef.current !== controller) return;
        if (append) {
          const merged = appendFeedPage(items, {
            data: page.data,
            pagination: page.pagination,
          });
          setItems(merged.items);
          setNextCursor(merged.nextCursor);
          setHasMore(merged.hasMore);
        } else {
          setItems(page.data);
          setNextCursor(page.pagination.nextCursor);
          setHasMore(page.pagination.hasMore);
          setStatus("ready");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (abortRef.current !== controller) return;
        const message =
          err instanceof ApiRequestError ? err.message : "Falha ao carregar";
        if (append) {
          setError(message);
        } else {
          setError(message);
          setStatus("error");
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeZone, items, nextCursor, hasMore],
  );

  const runQuery = useCallback(
    (next: DiaryQuery) => {
      queryRef.current = next;
      setQuery(next);
      commitToUrl(next);
      void fetchPage(withoutCursor(next), null, false);
    },
    [commitToUrl, fetchPage],
  );

  // Initial load from the URL (deep-link / refresh safe).
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      const initial = parseDiaryQuery(searchParams);
      queryRef.current = initial;
      setQuery(initial);
      setQInput(initial.q);
      void fetchPage(withoutCursor(initial), null, false);
      if (initial.userGameId !== "") {
        void apiRequest<Game>(
          `/api/games/${encodeURIComponent(initial.userGameId)}`,
        )
          .then((game) => setGameLabel(game.game?.name ?? "Jogo"))
          .catch(() => setGameLabel("Jogo"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced text search commits to query + URL.
  useEffect(() => {
    if (firstLoad.current) return;
    if (debouncedQ !== queryRef.current.q) {
      runQuery(withoutCursor({ ...queryRef.current, q: debouncedQ }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // Back/forward adopts external URL changes.
  useEffect(() => {
    if (firstLoad.current) return;
    const fromUrl = parseDiaryQuery(searchParams);
    if (
      serializeDiaryQuery({ ...fromUrl, cursor: undefined }) !==
      serializeDiaryQuery({ ...queryRef.current, cursor: undefined })
    ) {
      queryRef.current = fromUrl;
      setQuery(fromUrl);
      setQInput(fromUrl.q);
      void fetchPage(withoutCursor(fromUrl), null, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Game combobox options.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "20" });
    if (debouncedGameSearch !== "") params.set("search", debouncedGameSearch);
    apiRequest<PaginatedResponse<Game>>(`/api/games?${params.toString()}`)
      .then((result) => {
        if (cancelled) return;
        setGameOptions(
          result.data.map((game) => ({
            id: game._id,
            name: game.game?.name ?? "Jogo",
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setGameOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedGameSearch]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  function updateFilters(patch: Partial<DiaryQuery>) {
    runQuery(withoutCursor({ ...queryRef.current, ...patch }));
  }

  function clearFilters() {
    setQInput("");
    setGameSearch("");
    setGameLabel(null);
    runQuery({ ...DIARY_DEFAULTS, view: queryRef.current.view });
  }

  async function loadMore() {
    if (loadingMoreRef.current || !hasMore || nextCursor === null) return;
    loadingMoreRef.current = true;
    try {
      await fetchPage(queryRef.current, nextCursor, true);
    } finally {
      loadingMoreRef.current = false;
    }
  }

  async function openGameFromActivity(
    userGameId: string,
    focusNotes = false,
  ) {
    setOpenAutoFocusNotes(focusNotes);
    try {
      const game = await apiRequest<Game>(
        `/api/games/${encodeURIComponent(userGameId)}`,
      );
      setOpenGame(game);
    } catch {
      setError("Não foi possível abrir o jogo.");
    }
  }

  /** Autofocus notes only for pure note.created items (common case). */
  function shouldFocusNotes(item: FeedItem): boolean {
    return (
      item.members.length > 0 &&
      item.members.every((member) => member.type === "note.created")
    );
  }

  function openGameUserGameId(item: FeedItem): string | null {
    const ids = new Set(
      item.members
        .map((m) => m.userGameId)
        .filter((id): id is string => typeof id === "string"),
    );
    return ids.size === 1 ? [...ids][0] : null;
  }

  const activeFilters = hasActiveDiaryFilters(queryRef.current);

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Diário</h1>
      </header>

      <div className="rpgui-container framed-golden flex flex-col gap-2 p-4">
        <input
          className="rpgui-input w-full"
          type="search"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          placeholder="Buscar em jogos, listas e notas…"
          maxLength={200}
          aria-label="Buscar no diário"
        />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            Jogo
            <input
              className="rpgui-input w-full"
              type="search"
              value={gameSearch}
              onChange={(event) => setGameSearch(event.target.value)}
              placeholder="Filtrar por jogo…"
              aria-label="Filtrar por jogo"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Tipo
            <select
              className="rpgui-dropdown"
              value={query.type}
              onChange={(event) => updateFilters({ type: event.target.value })}
            >
              <option value="">Todos</option>
              {DIARY_TYPE_LABELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            De
            <input
              className="rpgui-input w-full"
              type="date"
              value={query.from}
              max={query.to || undefined}
              onChange={(event) => updateFilters({ from: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Até
            <input
              className="rpgui-input w-full"
              type="date"
              value={query.to}
              min={query.from || undefined}
              onChange={(event) => updateFilters({ to: event.target.value })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <RPGUIButton
              key={preset.value}
              type="button"
              title={preset.label}
              onClick={() => updateFilters(presetRange(preset.value))}
            />
          ))}
          <RPGUIButton
            type="button"
            title="Limpar filtros"
            onClick={clearFilters}
            disabled={!activeFilters}
          />
        </div>
        {gameOptions.length > 0 && gameSearch.trim() !== "" && (
          <ul className="rpgui-container framed-grey flex max-h-40 flex-col gap-1 overflow-y-auto p-2">
            {gameOptions.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="w-full text-left text-sm"
                  onClick={() => {
                    setGameLabel(option.name);
                    setGameSearch("");
                    updateFilters({ userGameId: option.id });
                  }}
                >
                  {option.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.userGameId !== "" && (
          <p className="text-sm">
            Jogo: {gameLabel ?? "…"} (
            <button
              type="button"
              className="underline"
              onClick={() => {
                setGameLabel(null);
                updateFilters({ userGameId: "" });
              }}
            >
              remover
            </button>
            )
          </p>
        )}
        <div className="flex items-center gap-2">
          <RPGUIButton
            type="button"
            title="Timeline"
            className={query.view === "timeline" ? "down" : ""}
            onClick={() => updateFilters({ view: "timeline" })}
            aria-label="Ver como timeline"
          />
          <RPGUIButton
            type="button"
            title="Lista"
            className={query.view === "list" ? "down" : ""}
            onClick={() => updateFilters({ view: "list" })}
            aria-label="Ver como lista"
          />
          <label className="ml-auto flex items-center gap-1 text-xs">
            Por página
            <select
              className="rpgui-dropdown"
              value={query.limit}
              onChange={(event) =>
                updateFilters({ limit: Number(event.target.value) })
              }
              aria-label="Itens por página"
            >
              {DIARY_LIMITS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {status === "loading" && <FeedLoading />}
      {status === "error" && (
        <>
          <p role="alert" className="rpgui-container framed-grey p-3">
            {error ?? "Não foi possível carregar o diário."}
          </p>
          <RPGUIButton
            type="button"
            title="Tentar novamente"
            onClick={() => runQuery(queryRef.current)}
          />
        </>
      )}
      {status === "ready" && error && (
        <p role="alert" className="rpgui-container framed-grey p-3 text-sm">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => runQuery(queryRef.current)}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {status === "ready" && items.length === 0 && (
        <>
          {activeFilters ? (
            <div className="rpgui-container framed-grey flex flex-col gap-2 p-4">
              <p>Nenhuma atividade encontrada para esses filtros.</p>
              <RPGUIButton
                type="button"
                title="Limpar filtros"
                onClick={clearFilters}
              />
            </div>
          ) : (
            <FeedEmpty />
          )}
        </>
      )}
      {status === "ready" && items.length > 0 && query.view === "timeline" && (
        <ActivityFeed
          items={items}
          timeZone={timeZone}
          onOpenGame={(userGameId) => {
            const member = items
              .flatMap((item) => item.members)
              .find((m) => m.userGameId === userGameId);
            void openGameFromActivity(
              userGameId,
              member?.type === "note.created",
            );
          }}
          footer={
            hasMore ? (
              <RPGUIButton
                type="button"
                title={loadingMore ? "Carregando…" : "Carregar mais"}
                onClick={() => void loadMore()}
                disabled={loadingMore}
              />
            ) : undefined
          }
        />
      )}
      {status === "ready" && items.length > 0 && query.view === "list" && (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const gameId = openGameUserGameId(item);
            return (
              <article
                key={item.members.map((m) => m._id).join("+")}
                className="rpgui-container framed-golden grid grid-cols-[1fr_auto] items-center gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs">
                    {formatDayHeading(item.span.from, timeZone)}
                  </p>
                  <h3 className="font-display truncate text-sm">
                    {item.title}
                    {item.count > 1 ? ` (${item.count})` : ""}
                  </h3>
                </div>
                {gameId && (
                  <RPGUIButton
                    type="button"
                    title="Abrir jogo"
                    onClick={() =>
                      void openGameFromActivity(
                        gameId,
                        shouldFocusNotes(item),
                      )
                    }
                  />
                )}
              </article>
            );
          })}
          {hasMore && (
            <RPGUIButton
              type="button"
              title={loadingMore ? "Carregando…" : "Carregar mais"}
              onClick={() => void loadMore()}
              disabled={loadingMore}
            />
          )}
        </div>
      )}

      <GameModal
        game={openGame}
        autoFocusNotes={openAutoFocusNotes}
        onClose={() => setOpenGame(null)}
      />
      <p className="text-sm">
        <Link href="/home" className="underline">
          ← Voltar para a Home
        </Link>
      </p>
    </div>
  );
}
