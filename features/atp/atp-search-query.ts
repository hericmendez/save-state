/**
 * Busca Geral — URL query state (pure, no JSX, ATP-domain).
 *
 * Mirrors the Collection Foundation conventions (URL owns navigable state,
 * defaults omitted from serialized links), speaking the BFF contract:
 * q/search, platform, genre, yearMin/yearMax, developer, publisher,
 * sortBy/order, page, limit, viewMode.
 *
 * Etapa 2 decisions encoded here:
 * - Title is optional: an empty search with filters still fetches; an
 *   empty search WITHOUT filters never fetches (see hasAtpSearch).
 * - Sort: "relevance" is the provider default and is represented by an
 *   absent sortBy (never written to the URL). "title" defaults to ASC,
 *   "year" defaults to DESC (see defaultOrderForSort).
 * - Family has NO free filter in the general search: parseAtpSearchQuery
 *   never reads it from the URL and serializeAtpSearchQuery never writes
 *   it. Family reaches the BFF exclusively as route-locked context
 *   (applyFixedContext on family detail pages).
 */

import {
  COLLECTION_PAGE_SIZES,
  parseCollectionOrder,
  parseViewMode,
  type CollectionOrder,
  type CollectionQueryInput,
  type CollectionViewMode,
} from "@/features/collection/collection-query";

/**
 * Índice alfanumérico — semântica de inicial (puro, sem JSX).
 *
 * Buckets (ordem da UI: Todos | # | 0–9 | A–Z):
 * - "" (Todos): sem filtro de inicial.
 * - "#": primeira letra NÃO é alfanumérica ASCII nem diacrítico
 *   latino-1 mapeado (símbolos, outros alfabetos, ligaduras).
 * - "0-9": primeira letra é um dígito ASCII.
 * - "A"–"Z": primeira letra normalizada (caixa alta, diacríticos
 *   latino-1 resolvidos para a letra base: Á=A, É=E, Ñ=N, Ç=C...).
 *
 * Regras (verificadas contra a API IGDB ao vivo):
 * - Espaços iniciais são ignorados; artigos ("The", "A") NÃO são
 *   ignorados — vale o início real do título.
 * - O `~` do Apicalypse é case-insensitive (inclusive para acentos),
 *   então só as formas maiúsculas entram nas cláusulas.
 * - Curinga SEMPRE fora das aspas: `name ~ "M"*` (prefixo). Com o `*`
 *   dentro das aspas o IGDB casa o literal — zero resultados.
 * - Grupos OR são parentizados: `(a | b) & resto` (`&` liga mais
 *   forte que `|`; sem parênteses a precedência corrompe o filtro).
 */
export const INITIAL_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
] as const;

export type InitialLetter = (typeof INITIAL_LETTERS)[number];

/** Bucket de inicial: letra, "0-9" ou "#". */
export type CatalogInitial = InitialLetter | "0-9" | "#";

export const INITIAL_DIGITS = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
] as const;

/**
 * Diacríticos Latin-1 por letra base (formas maiúsculas; o `~` do IGDB
 * é case-insensitive). Todo caractere aqui DEVE classificar para a sua
 * letra via `classifyInitial` (garantido por teste).
 */
export const INITIAL_VARIANTS: Record<InitialLetter, readonly string[]> = {
  A: ["À", "Á", "Â", "Ã", "Ä", "Å"],
  B: [],
  C: ["Ç"],
  D: ["Ð"],
  E: ["È", "É", "Ê", "Ë"],
  F: [],
  G: [],
  H: [],
  I: ["Ì", "Í", "Î", "Ï"],
  J: [],
  K: [],
  L: [],
  M: [],
  N: ["Ñ"],
  O: ["Ò", "Ó", "Ô", "Õ", "Ö", "Ø"],
  P: [],
  Q: [],
  R: [],
  S: [],
  T: [],
  U: ["Ù", "Ú", "Û", "Ü"],
  V: [],
  W: [],
  X: [],
  Y: ["Ý", "Ÿ"],
  Z: [],
};

/** Todas as formas que um bucket de letra casa no IGDB (base + variantes). */
export function initialForms(letter: InitialLetter): string[] {
  return [letter, ...INITIAL_VARIANTS[letter]];
}

/** Todas as formas negadas pelo bucket "#" (letras + dígitos). */
export function hashExcludedForms(): string[] {
  const forms: string[] = [];
  for (const letter of INITIAL_LETTERS) forms.push(...initialForms(letter));
  forms.push(...INITIAL_DIGITS);
  return forms;
}

/**
 * Classifica um título no seu bucket de inicial — espelho exato do que
 * as cláusulas IGDB casam (usado em testes/documentação; o filtro real
 * é sempre server-side, nunca sobre a página recebida).
 */
export function classifyInitial(title: string): CatalogInitial | null {
  const trimmed = title.replace(/^\s+/, "");
  if (trimmed === "") return null;
  const first = trimmed[0] as string;
  if (first >= "0" && first <= "9") return "0-9";
  const upper = first.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return upper as InitialLetter;
  for (const letter of INITIAL_LETTERS) {
    if (INITIAL_VARIANTS[letter].includes(upper)) return letter;
  }
  return "#";
}

export function isCatalogInitial(value: string): value is CatalogInitial {
  if (value === "0-9" || value === "#") return true;
  return (INITIAL_LETTERS as readonly string[]).includes(value);
}

/**
 * Normaliza o valor bruto da URL para um bucket válido ("" = Todos
 * quando ausente/inválido). Aceita letra minúscula ("m" → "M").
 */
export function parseInitialParam(raw: string): CatalogInitial | "" {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "todos") return "";
  if (trimmed === "0-9" || trimmed === "0–9") return "0-9";
  if (trimmed === "#") return "#";
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return upper as InitialLetter;
  return "";
}

/**
 * Fragmento Apicalypse `where` para a inicial — combinado com `&` às
 * demais cláusulas do provider IGDB. Atua sobre o universo completo
 * (server-side, antes da paginação); o `/games/count` usa as mesmas
 * cláusulas, então o browse por inicial mantém totais exatos.
 */
export function buildInitialClause(initial: CatalogInitial): string {
  if (initial === "#") {
    return hashExcludedForms()
      .map((form) => `name !~ "${form}"*`)
      .join(" & ");
  }
  const forms = initial === "0-9" ? [...INITIAL_DIGITS] : initialForms(initial);
  return `(${forms.map((form) => `name ~ "${form}"*`).join(" | ")})`;
}

export type AtpSortBy = "relevance" | "title" | "year";

/** Effective default direction per sort (Etapa 2 §3.4). Relevance has no
 *  direction: the provider ranking applies and `order` is ignored. */
export function defaultOrderForSort(
  sortBy: AtpSortBy | undefined,
): CollectionOrder {
  return sortBy === "year" ? "desc" : "asc";
}

export interface AtpSearchQuery {
  search: string;
  platform: string;
  /**
   * Explicit IGDB platform ids (Parte B). Never parsed from the page
   * URL and never serialized into it: set only through fixed route
   * context (`applyFixedContext`), sent only to the BFF.
   */
  platformIds?: number[];
  genre: string;
  yearMin: number | undefined;
  yearMax: number | undefined;
  developer: string;
  publisher: string;
  family: string;
  /**
   * Índice alfanumérico ("" = Todos, sem filtro). Conta como filtro para
   * `hasAtpSearch` (browse só-por-inicial busca de verdade) e reseta a
   * página ao mudar — ver InitialSelect.
   */
  initial: CatalogInitial | "";
  sortBy: AtpSortBy | undefined;
  page: number;
  limit: number;
  viewMode: CollectionViewMode;
  order: CollectionOrder;
}

export const ATP_SEARCH_DEFAULTS: AtpSearchQuery = {
  search: "",
  platform: "",
  genre: "",
  yearMin: undefined,
  yearMax: undefined,
  developer: "",
  publisher: "",
  family: "",
  initial: "",
  sortBy: undefined,
  page: 1,
  limit: 20,
  viewMode: "grid",
  order: "asc",
};

function firstString(
  input: Exclude<CollectionQueryInput, undefined>,
  key: string,
): string {
  const raw =
    input instanceof URLSearchParams ? input.get(key) : input[key];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? "").trim();
}

function parsePage(raw: string): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function parseYear(raw: string): number | undefined {
  if (!/^\d{4}$/.test(raw)) return undefined;
  const year = Number(raw);
  return year >= 1950 && year <= 2100 ? year : undefined;
}

/** Parse a free-text year bound (empty/invalid → undefined, no throw). */
export function parseYearBound(raw: string): number | undefined {
  return parseYear(raw.trim());
}

/** Invalid values fall back predictably instead of throwing. */
export function parseAtpSearchQuery(
  input: CollectionQueryInput,
): AtpSearchQuery {
  if (!input) return { ...ATP_SEARCH_DEFAULTS };
  const limit = parsePage(firstString(input, "limit") || "20");
  // Deprecated single-year alias: maps to both bounds when the range is
  // absent, so old shared links keep working.
  const legacyYear = parseYear(firstString(input, "year"));
  const yearMin = parseYear(firstString(input, "yearMin")) ?? legacyYear;
  const yearMax = parseYear(firstString(input, "yearMax")) ?? legacyYear;
  const sortRaw = firstString(input, "sortBy");
  // "relevance" (explicit or absent) is the provider default: represented
  // by an absent sortBy so it never leaks into serialized links.
  const sortBy: AtpSearchQuery["sortBy"] =
    sortRaw === "title" || sortRaw === "year" ? sortRaw : undefined;
  return {
    search: firstString(input, "search").slice(0, 200),
    platform: firstString(input, "platform").slice(0, 100),
    genre: firstString(input, "genre").slice(0, 100),
    yearMin,
    yearMax,
    developer: firstString(input, "developer").slice(0, 100),
    publisher: firstString(input, "publisher").slice(0, 100),
    // Etapa 2 §3.6: no free family filter in the general search. Family
    // arrives only via applyFixedContext (family detail pages); a `family`
    // URL param here would bypass the route lock, so it is ignored.
    family: "",
    initial: parseInitialParam(firstString(input, "initial")),
    sortBy,
    page: parsePage(firstString(input, "page") || "1"),
    limit: (COLLECTION_PAGE_SIZES as readonly number[]).includes(limit)
      ? limit
      : ATP_SEARCH_DEFAULTS.limit,
    viewMode: parseViewMode(firstString(input, "viewMode") || undefined),
    order: parseCollectionOrder(firstString(input, "order") || undefined),
  };
}

/** Serialize, omitting defaults so shared links stay clean. Round-trips. */
export function serializeAtpSearchQuery(query: Partial<AtpSearchQuery>): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value !== "") params.set(key, value);
  };
  set("search", (query.search ?? "").trim());
  set("platform", (query.platform ?? "").trim());
  set("genre", (query.genre ?? "").trim());
  if (query.yearMin !== undefined) params.set("yearMin", String(query.yearMin));
  if (query.yearMax !== undefined) params.set("yearMax", String(query.yearMax));
  set("developer", (query.developer ?? "").trim());
  set("publisher", (query.publisher ?? "").trim());
  // Family is route context, never a free URL param (Etapa 2 §3.6): it is
  // injected by applyFixedContext and sent to the BFF, but shared links
  // stay clean of it. `initial` is a free filter: written only when set
  // (Todos = absent).
  if (query.initial !== undefined && query.initial !== "") {
    params.set("initial", query.initial);
  }
  if (query.sortBy !== undefined) params.set("sortBy", query.sortBy);
  // Direction only matters with an explicit title/year sort.
  if (query.sortBy !== undefined && query.order !== undefined) {
    params.set("order", query.order);
  }
  if (query.page !== undefined && query.page !== ATP_SEARCH_DEFAULTS.page) {
    params.set("page", String(query.page));
  }
  if (query.limit !== undefined && query.limit !== ATP_SEARCH_DEFAULTS.limit) {
    params.set("limit", String(query.limit));
  }
  if (
    query.viewMode !== undefined &&
    query.viewMode !== ATP_SEARCH_DEFAULTS.viewMode
  ) {
    params.set("viewMode", query.viewMode);
  }
  return params.toString();
}

export interface AtpBffParams {
  q?: string;
  platform?: string;
  platformIds?: number[];
  genre?: string;
  yearMin?: number;
  yearMax?: number;
  developer?: string;
  publisher?: string;
  family?: string;
  initial?: CatalogInitial;
  sortBy?: AtpSortBy;
  order?: CollectionOrder;
  page: number;
  limit: number;
}

/** Map the URL query onto the real BFF contract (search → q). */
export function toAtpBffParams(query: AtpSearchQuery): AtpBffParams {
  const params: AtpBffParams = { page: query.page, limit: query.limit };
  if (query.search !== "") params.q = query.search;
  if (query.platform !== "") params.platform = query.platform;
  if (query.platformIds !== undefined && query.platformIds.length > 0) {
    params.platformIds = [...query.platformIds];
  }
  if (query.genre !== "") params.genre = query.genre;
  if (query.yearMin !== undefined) params.yearMin = query.yearMin;
  if (query.yearMax !== undefined) params.yearMax = query.yearMax;
  if (query.developer !== "") params.developer = query.developer;
  if (query.publisher !== "") params.publisher = query.publisher;
  if (query.family !== "") params.family = query.family;
  if (query.initial !== "") params.initial = query.initial;
  if (query.sortBy !== undefined) params.sortBy = query.sortBy;
  if (query.sortBy !== undefined && query.order !== undefined) {
    params.order = query.order;
  }
  return params;
}

export function buildAtpBffSearchString(query: AtpSearchQuery): string {
  const bff = toAtpBffParams(query);
  const params = new URLSearchParams({
    page: String(bff.page),
    limit: String(bff.limit),
  });
  // The BFF requires q or at least one filter; callers guarantee a
  // submitted query before fetching.
  if (bff.q !== undefined) params.set("q", bff.q);
  if (bff.platform !== undefined) params.set("platform", bff.platform);
  if (bff.platformIds !== undefined && bff.platformIds.length > 0) {
    params.set("platformIds", bff.platformIds.join(","));
  }
  if (bff.genre !== undefined) params.set("genre", bff.genre);
  if (bff.yearMin !== undefined) params.set("yearMin", String(bff.yearMin));
  if (bff.yearMax !== undefined) params.set("yearMax", String(bff.yearMax));
  if (bff.developer !== undefined) params.set("developer", bff.developer);
  if (bff.publisher !== undefined) params.set("publisher", bff.publisher);
  if (bff.family !== undefined) params.set("family", bff.family);
  if (bff.initial !== undefined) params.set("initial", bff.initial);
  if (bff.sortBy !== undefined) params.set("sortBy", bff.sortBy);
  if (bff.order !== undefined) params.set("order", bff.order);
  return params.toString();
}
/** A submitted search has text or at least one refinement filter.
 *  Sorting alone never triggers a fetch (nothing to order yet). The
 *  alphabetical initial counts as a filter (initial-only browse). */
export function hasAtpSearch(query: AtpSearchQuery): boolean {
  return (
    query.search !== "" ||
    query.platform !== "" ||
    (query.platformIds?.length ?? 0) > 0 ||
    query.genre !== "" ||
    query.yearMin !== undefined ||
    query.yearMax !== undefined ||
    query.developer !== "" ||
    query.publisher !== "" ||
    query.family !== "" ||
    query.initial !== ""
  );
}

export interface AtpFixedContext {
  platform?: string;
  family?: string;
  /**
   * Explicit IGDB platform ids locked by the route (editorial detail
   * pages). Like `family`: never read from the page URL, never written
   * to it — injected by `applyFixedContext` and sent only to the BFF.
   * The locked name filter still travels in `platform`, so the BFF sees
   * both and the provider unions them.
   */
  platformIds?: number[];
}

/**
 * Route context prevails: a platform/family detail page locks its value,
 * so a contradictory URL param (e.g. ?platform=nes on the PS5 page) can
 * never escape the page context.
 */
export function applyFixedContext(
  query: AtpSearchQuery,
  fixed: AtpFixedContext,
): AtpSearchQuery {
  return {
    ...query,
    platform: fixed.platform ?? query.platform,
    platformIds: fixed.platformIds ?? query.platformIds,
    family: fixed.family ?? query.family,
  };
}

/** Fixed values live in the route, not the query string (no duplication).
 *  Family detail pages lock the family; platform detail pages lock the
 *  platform. Only the platform lock needs URL stripping here — family is
 *  never serialized (see serializeAtpSearchQuery). Explicit platform ids
 *  are likewise never serialized: they travel only to the BFF. */
export function serializeWithFixedContext(
  query: AtpSearchQuery,
  fixed: AtpFixedContext,
): string {
  return serializeAtpSearchQuery({
    ...query,
    platform: fixed.platform ? "" : query.platform,
    family: "",
  });
}
