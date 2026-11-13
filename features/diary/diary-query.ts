/**
 * Diário — URL query state (pure, no JSX).
 *
 * Conventions follow the Collection Foundation (URL owns navigable state,
 * defaults omitted, invalid falls back), but the shape is diary-specific:
 * cursor pagination (never page numbers), no order (always newest-first),
 * view is timeline|list (never grid).
 *
 * NOTE: this module stays runtime-free of server-only code (no
 * `@/schemas/activity` import — it pulls `server-only` via ApiError).
 * Type values are shape-checked here; the API enum is authoritative and
 * rejects unknown types with INVALID_QUERY.
 */

export type DiaryViewMode = "timeline" | "list";

export interface DiaryQuery {
  q: string;
  userGameId: string;
  type: string;
  from: string;
  to: string;
  cursor?: string;
  limit: number;
  view: DiaryViewMode;
}

export const DIARY_DEFAULTS: DiaryQuery = {
  q: "",
  userGameId: "",
  type: "",
  from: "",
  to: "",
  limit: 10,
  view: "timeline",
};

export const DIARY_LIMITS = [10, 20, 30, 50] as const;

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Shape only — the API enum rejects unknown types with INVALID_QUERY.
const TYPE_PATTERN = /^[a-z0-9._-]{1,64}$/i;

export type DiaryQueryInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined;

function firstString(
  input: Exclude<DiaryQueryInput, undefined>,
  key: string,
): string {
  const raw =
    input instanceof URLSearchParams ? input.get(key) : input[key];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? "").trim();
}

/** Invalid values fall back predictably instead of throwing. */
export function parseDiaryQuery(input: DiaryQueryInput): DiaryQuery {
  if (!input) return { ...DIARY_DEFAULTS };
  const limit = Number(firstString(input, "limit"));
  const type = firstString(input, "type");
  const userGameId = firstString(input, "userGameId");
  const from = firstString(input, "from");
  const to = firstString(input, "to");
  return {
    q: firstString(input, "q").slice(0, 200),
    userGameId: OBJECT_ID_PATTERN.test(userGameId) ? userGameId : "",
    type: TYPE_PATTERN.test(type) ? type : "",
    from: DATE_PATTERN.test(from) ? from : "",
    to: DATE_PATTERN.test(to) ? to : "",
    cursor: firstString(input, "cursor") || undefined,
    limit:
      Number.isInteger(limit) && limit >= 1 && limit <= 50
        ? limit
        : DIARY_DEFAULTS.limit,
    view: firstString(input, "view") === "list" ? "list" : "timeline",
  };
}

/** Serialize, omitting defaults so shared links stay clean. Round-trips. */
export function serializeDiaryQuery(query: Partial<DiaryQuery>): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value !== "") params.set(key, value);
  };
  set("q", (query.q ?? "").trim());
  set("userGameId", (query.userGameId ?? "").trim());
  set("type", (query.type ?? "").trim());
  set("from", (query.from ?? "").trim());
  set("to", (query.to ?? "").trim());
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit !== undefined && query.limit !== DIARY_DEFAULTS.limit) {
    params.set("limit", String(query.limit));
  }
  if (query.view !== undefined && query.view !== DIARY_DEFAULTS.view) {
    params.set("view", query.view);
  }
  return params.toString();
}

/** Any filter/query change starts a new consultation: drop the cursor. */
export function withoutCursor(query: DiaryQuery): DiaryQuery {
  const { cursor: _dropped, ...rest } = query;
  return rest;
}

export function hasActiveDiaryFilters(query: DiaryQuery): boolean {
  return (
    query.q !== "" ||
    query.userGameId !== "" ||
    query.type !== "" ||
    query.from !== "" ||
    query.to !== ""
  );
}

/** Short pt-BR labels for the single-select type filter (UI strings). */
export const DIARY_TYPE_LABELS: Array<{ value: string; label: string }> = [
  { value: "game.added", label: "Jogo adicionado" },
  { value: "game.removed", label: "Jogo removido" },
  { value: "game.status_changed", label: "Status alterado" },
  { value: "game.finished", label: "Jogo finalizado" },
  { value: "game.times_finished_changed", label: "Vezes zerado alterado" },
  { value: "game.favorited", label: "Favoritado" },
  { value: "game.unfavorited", label: "Desfavoritado" },
  { value: "game.completed", label: "100% completado" },
  { value: "game.uncompleted", label: "100% desfeito" },
  { value: "game.rating_changed", label: "Nota alterada" },
  { value: "game.hours_changed", label: "Horas alteradas" },
  { value: "game.achievements_changed", label: "Conquistas alteradas" },
  { value: "note.created", label: "Nota criada" },
  { value: "game.added_to_list", label: "Adicionado à lista" },
  { value: "game.removed_from_list", label: "Removido da lista" },
  { value: "list.created", label: "Lista criada" },
  { value: "list.renamed", label: "Lista renomeada" },
  { value: "list.deleted", label: "Lista excluída" },
  { value: "game.added_to_collection", label: "Adicionado à coleção" },
  { value: "game.removed_from_collection", label: "Removido da coleção" },
  { value: "collection.created", label: "Coleção criada" },
  { value: "collection.renamed", label: "Coleção renomeada" },
  { value: "collection.deleted", label: "Coleção excluída" },
  { value: "top10.added", label: "Entrou no Top 10" },
  { value: "top10.removed", label: "Saiu do Top 10" },
  { value: "top10.reordered", label: "Top 10 reordenado" },
];
