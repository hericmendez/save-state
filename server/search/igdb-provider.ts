/**
 * IGDB-backed SearchProvider (Etapa 3).
 *
 * Rewritten from scratch for Save State (reference: atp-engine IGDB
 * adapter — never imported). Speaks Apicalypse over POST
 * https://api.igdb.com/v4/* via igdb-client (token cache, 401 retry,
 * 250ms throttle, timeouts). Returns only the neutral contract.
 *
 * Identity rule: IGDB ids are numeric strings. A non-numeric id is
 * NEVER interpreted as IGDB — it fails with IGDB_GAME_NOT_FOUND, so an
 * ATP id can never leak into (or out of) the IGDB path.
 */

import "server-only";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/server/shared/logger";
import {
  IGDB_COVER_TIMEOUT_MS,
  IGDB_DETAIL_TIMEOUT_MS,
  IGDB_SEARCH_TIMEOUT_MS,
  buildIgdbImageUrl,
  escapeApicalypse,
  igdbRequest,
} from "@/server/search/igdb-client";
import { getTwitchToken } from "@/server/search/twitch-token";
import { buildInitialClause } from "@/features/atp/atp-search-query";
import {
  igdbCompanyListSchema,
  igdbCountSchema,
  igdbCoverOnlyListSchema,
  igdbGameListSchema,
  igdbGenreListSchema,
  igdbInvolvementListSchema,
  igdbPlatformListSchema,
  type IgdbGame,
} from "@/server/search/igdb-schemas";
import {
  catalogPlatformsByFamily,
  findCatalogPlatform,
  resolveIgdbPlatformIds,
  IGDB_PLATFORM_CATALOG,
  type IgdbCatalogPlatform,
} from "@/server/search/igdb-platforms";
import type {
  SearchCover,
  SearchFamily,
  SearchPlatform,
  SearchPlatformList,
  SearchPlatformListParams,
  SearchPreview,
  SearchProvider,
  SearchQueryParams,
} from "@/server/search/types";

/** Canonically admissible IGDB game types (main, standalone expansion, remake, remaster, expanded). */
const CANONICAL_GAME_TYPES = [0, 4, 8, 9, 10] as const;

const GAME_FIELDS = [
  "name",
  "slug",
  "summary",
  "first_release_date",
  "genres",
  "genres.name",
  "platforms",
  "platforms.name",
  "involved_companies",
  "cover.image_id",
  "game_type",
  "status",
  "release_dates.date",
  "release_dates.platform",
  "release_dates.region",
].join(",");

/** IGDB region enum → label. Unknown ids stay null (never invented). */
const IGDB_REGION_NAMES: Record<number, string> = {
  1: "Europe",
  2: "North America",
  3: "Australia",
  4: "New Zealand",
  5: "Japan",
  6: "China",
  7: "Asia",
  8: "Worldwide",
  9: "Korea",
  10: "Brazil",
};

/** IGDB genre id → name fallback (public taxonomy) when expansion is absent. */
const IGDB_GENRE_NAMES: Record<number, string> = {
  2: "Point-and-click",
  4: "Fighting",
  5: "Shooter",
  7: "Music",
  8: "Platform",
  9: "Puzzle",
  10: "Racing",
  11: "Real Time Strategy (RTS)",
  12: "Role-playing (RPG)",
  13: "Simulator",
  14: "Sport",
  15: "Strategy",
  16: "Turn-based strategy (TBS)",
  17: "Tactical",
  18: "Hack and slash/Beat 'em up",
  19: "Quiz/Trivia",
  20: "Pinball",
  21: "Adventure",
  22: "Indie",
  23: "Arcade",
  24: "Visual Novel",
  25: "Card & Board Game",
  26: "MOBA",
  28: "Massively Multiplayer Online (MMO)",
  30: "Digital Card Game",
  31: "Adventure",
  32: "Indie",
  33: "Puzzle",
  34: "Tactical RPG",
  35: "Battle Royale",
};

function parseIgdbId(id: string): number | undefined {
  if (!/^[0-9]{1,10}$/.test(id)) return undefined;
  const numeric = Number(id);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

function yearFromUnix(timestamp: number | null | undefined): number | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  return new Date(timestamp * 1000).getUTCFullYear();
}

function gamePlatformNames(game: IgdbGame): string[] {
  const names: string[] = [];
  for (const platform of game.platforms ?? []) {
    if (typeof platform === "object" && platform !== null) {
      if (platform.name.trim()) names.push(platform.name.trim());
      continue;
    }
    const entry = findCatalogPlatform(platform);
    if (entry) names.push(entry.name);
  }
  return uniqueStrings(names);
}

function gameGenreNames(game: IgdbGame): string[] {
  const names: string[] = [];
  for (const genre of game.genres ?? []) {
    if (typeof genre === "object" && genre !== null) {
      if (genre.name.trim()) names.push(genre.name.trim());
      continue;
    }
    const fallback = IGDB_GENRE_NAMES[genre];
    if (fallback) names.push(fallback);
  }
  return uniqueStrings(names);
}

function gameCoverUrl(game: IgdbGame): string | null {
  const imageId = game.cover?.image_id;
  if (typeof imageId !== "string" || !imageId) return null;
  return buildIgdbImageUrl(imageId, "t_cover_big");
}

interface CompanyRoles {
  developers: string[];
  publishers: string[];
}

async function fetchCompanyRoles(
  involvementIds: number[],
  source?: Record<string, string | undefined>,
): Promise<CompanyRoles> {
  const empty: CompanyRoles = { developers: [], publishers: [] };
  if (involvementIds.length === 0) return empty;
  try {
    const capped = involvementIds.slice(0, 500);
    const involvementsPayload = await igdbRequest(
      "/involved_companies",
      `where id = (${capped.join(",")}); fields company,developer,publisher; limit 500;`,
      { timeoutMs: IGDB_DETAIL_TIMEOUT_MS, route: "POST /involved_companies" },
      source,
    );
    const involvements = igdbInvolvementListSchema.parse(involvementsPayload);
    const rolesByCompany = new Map<number, { developer: boolean; publisher: boolean }>();
    for (const involvement of involvements) {
      const current = rolesByCompany.get(involvement.company) ?? {
        developer: false,
        publisher: false,
      };
      current.developer = current.developer || involvement.developer === true;
      current.publisher = current.publisher || involvement.publisher === true;
      rolesByCompany.set(involvement.company, current);
    }
    if (rolesByCompany.size === 0) return empty;
    const companiesPayload = await igdbRequest(
      "/companies",
      `where id = (${[...rolesByCompany.keys()].join(",")}); fields name; limit 500;`,
      { timeoutMs: IGDB_DETAIL_TIMEOUT_MS, route: "POST /companies" },
      source,
    );
    const companies = igdbCompanyListSchema.parse(companiesPayload);
    const names = new Map(companies.map((c) => [c.id, c.name]));
    const developers: string[] = [];
    const publishers: string[] = [];
    for (const [companyId, roles] of rolesByCompany) {
      const name = names.get(companyId);
      if (name === undefined) continue;
      if (roles.developer) developers.push(name);
      if (roles.publisher) publishers.push(name);
    }
    return {
      developers: uniqueStrings(developers),
      publishers: uniqueStrings(publishers),
    };
  } catch {
    // Company data degrades to empty rather than failing the lookup.
    return empty;
  }
}

// --- Filter resolution caches (per-process, bounded) ---

interface CacheEntry<T> {
  value: T;
  at: number;
}

const COMPANY_CACHE_TTL_MS = 10 * 60_000;
const COMPANY_CACHE_MAX = 200;
const companyCache = new Map<string, CacheEntry<number[]>>();

let genreCache: Array<{ id: number; name: string }> | null = null;

export function __resetIgdbFilterCaches(): void {
  companyCache.clear();
  genreCache = null;
}

async function resolveCompanyIds(
  query: string,
  source?: Record<string, string | undefined>,
): Promise<number[]> {
  const key = query.trim().toLowerCase();
  const cached = companyCache.get(key);
  if (cached && Date.now() - cached.at < COMPANY_CACHE_TTL_MS) return cached.value;
  const payload = await igdbRequest(
    "/companies",
    `search "${escapeApicalypse(query.trim())}"; fields name; limit 10;`,
    { timeoutMs: IGDB_SEARCH_TIMEOUT_MS, route: "POST /companies" },
    source,
  );
  const companies = igdbCompanyListSchema.parse(payload);
  const ids = companies.map((c) => c.id);
  if (companyCache.size >= COMPANY_CACHE_MAX) {
    const oldest = companyCache.keys().next().value;
    if (oldest !== undefined) companyCache.delete(oldest);
  }
  companyCache.set(key, { value: ids, at: Date.now() });
  return ids;
}

async function resolveGenreIds(
  query: string,
  source?: Record<string, string | undefined>,
): Promise<number[]> {
  if (!genreCache) {
    const payload = await igdbRequest(
      "/genres",
      "fields name; limit 100; sort name asc;",
      { timeoutMs: IGDB_SEARCH_TIMEOUT_MS, route: "POST /genres" },
      source,
    );
    genreCache = igdbGenreListSchema.parse(payload);
  }
  const needle = query.trim().toLowerCase();
  const exact = genreCache.filter((g) => g.name.toLowerCase() === needle);
  if (exact.length > 0) return exact.map((g) => g.id);
  return genreCache
    .filter((g) => g.name.toLowerCase().includes(needle))
    .map((g) => g.id);
}

async function resolveInvolvementIds(
  companyQuery: string,
  role: "developer" | "publisher",
  source?: Record<string, string | undefined>,
): Promise<number[]> {
  const companyIds = await resolveCompanyIds(companyQuery, source);
  if (companyIds.length === 0) return [];
  const payload = await igdbRequest(
    "/involved_companies",
    `where company = (${companyIds.join(",")}) & ${role} = true; fields id; limit 500;`,
    { timeoutMs: IGDB_SEARCH_TIMEOUT_MS, route: "POST /involved_companies" },
    source,
  );
  return igdbInvolvementListSchema.parse(payload).map((i) => i.id);
}

// --- Provider ---

function emptyPage(page: number, limit: number) {
  return {
    data: [],
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: page > 1,
    },
  };
}

export class IgdbSearchProvider implements SearchProvider {
  readonly providerName = "IGDB" as const;

  /** Eager config check: fails fast with a clear message when Twitch creds are missing. */
  async ensureConfigured(
    source?: Record<string, string | undefined>,
  ): Promise<void> {
    await getTwitchToken(source);
  }

  async searchGames(
    params: SearchQueryParams,
    source?: Record<string, string | undefined>,
  ) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    // Platform + family both translate to IGDB platform ids (union:
    // available on any of them). Unknown names are dropped — they can
    // never match in IGDB, so this only narrows, never broadens.
    // Explicit platformIds (Parte B, fixed editorial context) union with
    // name-resolved ids: the editorial validated set always contains the
    // name resolution, so this preserves the name filter exactly while
    // covering platforms outside the fixed catalog. A present-but-invalid
    // id list still counts as a filter (empty page, never broad search).
    const hasExplicitIds = (params.platformIds?.length ?? 0) > 0;
    const explicitIds = (params.platformIds ?? []).filter(
      (id) => Number.isSafeInteger(id) && id > 0,
    );
    let platformIds: number[] = [...explicitIds];
    if (params.platform !== undefined) {
      const { ids } = resolveIgdbPlatformIds(params.platform);
      platformIds.push(...ids);
    }
    if (params.family !== undefined) {
      platformIds.push(
        ...catalogPlatformsByFamily(params.family).map((p) => p.igdbId),
      );
    }
    platformIds = [...new Set(platformIds)];
    if (
      (params.platform !== undefined ||
        params.family !== undefined ||
        hasExplicitIds) &&
      platformIds.length === 0
    ) {
      return emptyPage(page, limit);
    }

    const clauses: string[] = [
      `game_type = (${CANONICAL_GAME_TYPES.join(",")})`,
    ];
    if (platformIds.length > 0) clauses.push(`platforms = (${platformIds.join(",")})`);
    if (params.genre !== undefined) {
      const genreIds = await resolveGenreIds(params.genre, source);
      if (genreIds.length === 0) return emptyPage(page, limit);
      clauses.push(`genres = (${genreIds.join(",")})`);
    }
    if (params.developer !== undefined) {
      const ids = await resolveInvolvementIds(params.developer, "developer", source);
      if (ids.length === 0) return emptyPage(page, limit);
      clauses.push(`involved_companies = (${ids.join(",")})`);
    }
    if (params.publisher !== undefined) {
      const ids = await resolveInvolvementIds(params.publisher, "publisher", source);
      if (ids.length === 0) return emptyPage(page, limit);
      clauses.push(`involved_companies = (${ids.join(",")})`);
    }
    if (params.yearMin !== undefined || params.yearMax !== undefined) {
      // Inclusive range on the release timestamp: [Jan 1 of yearMin,
      // start of (yearMax + 1)). The exclusive upper bound includes the
      // whole last day of yearMax. Games without first_release_date
      // never match a year-restricted query (documented behavior).
      if (params.yearMin !== undefined) {
        clauses.push(`first_release_date >= ${Date.UTC(params.yearMin, 0, 1) / 1000}`);
      }
      if (params.yearMax !== undefined) {
        clauses.push(`first_release_date < ${Date.UTC(params.yearMax + 1, 0, 1) / 1000}`);
      }
    }
    if (params.initial !== undefined) {
      // Índice alfanumérico: prefixo server-side sobre o universo
      // completo (antes da paginação), combinado com `&` aos demais
      // filtros. A mesma lista `clauses` alimenta o `/games/count`,
      // então o browse só-por-inicial mantém totais exatos.
      clauses.push(buildInitialClause(params.initial));
    }

    const hasText = params.q !== "";
    // Native server-side ordering (never client-side: with pagination that
    // would sort only the current page). Only name/first_release_date are
    // IGDB-sortable scalar fields; relevance (text search without an
    // explicit sort) keeps IGDB's own ranking.
    const sortField =
      params.sortBy === "title"
        ? "name"
        : params.sortBy === "year"
          ? "first_release_date"
          : null;
    const sortDir =
      params.order ?? (params.sortBy === "year" ? "desc" : "asc");
    // Over-fetch one row to derive hasNext (IGDB /games/count does not
    // support text search, so totals for text queries are estimates).
    const body = [
      ...(hasText ? [`search "${escapeApicalypse(params.q)}";`] : []),
      `where ${clauses.join(" & ")};`,
      `fields ${GAME_FIELDS};`,
      ...(sortField ? [`sort ${sortField} ${sortDir};`] : []),
      `limit ${limit + 1};`,
      `offset ${offset};`,
    ].join(" ");
    const payload = await igdbRequest(
      "/games",
      body,
      { timeoutMs: IGDB_SEARCH_TIMEOUT_MS, route: "POST /games" },
      source,
    );
    let games: IgdbGame[];
    try {
      games = igdbGameListSchema.parse(payload);
    } catch (error) {
      logger.error("IGDB schema mismatch", {
        route: "POST /games",
        issues:
          error instanceof Error && "issues" in error
            ? JSON.stringify((error as { issues: unknown }).issues).slice(0, 500)
            : "unknown",
      });
      throw new ApiError(
        "INTERNAL_ERROR",
        "The game catalog returned an unexpected response",
        500,
      );
    }
    const hasNext = games.length > limit;
    const pageGames = hasNext ? games.slice(0, limit) : games;

    // Exact totals for filter-only browse via /games/count.
    let total: number;
    if (!hasText) {
      try {
        const countPayload = await igdbRequest(
          "/games/count",
          `where ${clauses.join(" & ")};`,
          { timeoutMs: IGDB_SEARCH_TIMEOUT_MS, route: "POST /games/count" },
          source,
        );
        total = igdbCountSchema.parse(countPayload).count;
      } catch {
        total = hasNext ? page * limit + 1 : offset + pageGames.length;
      }
    } else {
      total = hasNext ? page * limit + 1 : offset + pageGames.length;
    }
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: pageGames.map((game) => ({
        id: String(game.id),
        name: game.name,
        year: yearFromUnix(game.first_release_date),
        platforms: gamePlatformNames(game),
        genres: gameGenreNames(game),
        // Already in the /games payload: cards carry their cover so the
        // UI never needs a per-card cover lookup for IGDB results.
        coverUrl: gameCoverUrl(game),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: hasNext,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getGameDetail(
    id: string,
    source?: Record<string, string | undefined>,
  ): Promise<Omit<SearchPreview, "manualDuplicate" | "owned">> {
    const numericId = parseIgdbId(id);
    if (numericId === undefined) {
      throw new ApiError("IGDB_GAME_NOT_FOUND", "Game not found", 404);
    }
    const payload = await igdbRequest(
      "/games",
      `where id = ${numericId}; fields ${GAME_FIELDS}; limit 1;`,
      { timeoutMs: IGDB_DETAIL_TIMEOUT_MS, route: "POST /games" },
      source,
    );
    const games = igdbGameListSchema.parse(payload);
    const game = games[0];
    if (!game) {
      throw new ApiError("IGDB_GAME_NOT_FOUND", "Game not found", 404);
    }
    const roles = await fetchCompanyRoles(game.involved_companies ?? [], source);
    const releases = (game.release_dates ?? [])
      .map((release) => {
        const platform = release.platform;
        const platformName =
          typeof platform === "object" && platform !== null
            ? (platform.name ?? null)
            : typeof platform === "number"
              ? (findCatalogPlatform(platform)?.name ?? null)
              : null;
        return {
          platform: platformName,
          region:
            typeof release.region === "number"
              ? (IGDB_REGION_NAMES[release.region] ?? null)
              : null,
          year: yearFromUnix(release.date),
          month:
            typeof release.date === "number"
              ? new Date(release.date * 1000).getUTCMonth() + 1
              : null,
          day:
            typeof release.date === "number"
              ? new Date(release.date * 1000).getUTCDate()
              : null,
          precision: null,
          version: null,
          edition: null,
        };
      })
      .filter((r) => r.platform !== null || r.year !== null);
    return {
      id: String(game.id),
      name: game.name,
      year: yearFromUnix(game.first_release_date),
      platforms: gamePlatformNames(game),
      developers: roles.developers,
      publishers: roles.publishers,
      genres: gameGenreNames(game),
      summary: game.summary ?? null,
      releases,
      externalIdentifiers: [{ source: "igdb", id: String(game.id) }],
      coverUrl: gameCoverUrl(game),
    };
  }

  async getGameCover(
    id: string,
    source?: Record<string, string | undefined>,
  ): Promise<SearchCover | null> {
    const numericId = parseIgdbId(id);
    if (numericId === undefined) return null;
    const payload = await igdbRequest(
      "/games",
      `where id = ${numericId}; fields cover.image_id; limit 1;`,
      { timeoutMs: IGDB_COVER_TIMEOUT_MS, route: "POST /games" },
      source,
    );
    const games = igdbCoverOnlyListSchema.parse(payload);
    const game = games[0];
    if (!game) return null;
    const imageId = game.cover?.image_id;
    if (typeof imageId !== "string" || !imageId) return null;
    return {
      url: buildIgdbImageUrl(imageId, "t_cover_big"),
      width: null,
      height: null,
      source: "igdb",
    };
  }

  async searchCovers(
    params: { q: string; limit: number },
    source?: Record<string, string | undefined>,
  ): Promise<SearchCover[]> {
    const payload = await igdbRequest(
      "/games",
      [
        `search "${escapeApicalypse(params.q)}";`,
        `where game_type = (${CANONICAL_GAME_TYPES.join(",")});`,
        "fields cover.image_id;",
        `limit ${params.limit};`,
      ].join(" "),
      { timeoutMs: IGDB_COVER_TIMEOUT_MS, route: "POST /games" },
      source,
    );
    const games = igdbCoverOnlyListSchema.parse(payload);
    const seen = new Set<string>();
    const covers: SearchCover[] = [];
    for (const game of games) {
      const imageId = game.cover?.image_id;
      if (typeof imageId !== "string" || !imageId || seen.has(imageId)) continue;
      seen.add(imageId);
      covers.push({
        url: buildIgdbImageUrl(imageId, "t_cover_big"),
        width: null,
        height: null,
        source: "igdb",
      });
    }
    return covers;
  }

  async listPlatforms(
    params: SearchPlatformListParams,
    source?: Record<string, string | undefined>,
  ): Promise<SearchPlatformList> {
    let entries = [...IGDB_PLATFORM_CATALOG];
    if (params.companyName !== undefined) {
      // Free-text platform match: official name, alias, or manufacturer.
      // One static-catalog lookup, no extra IGDB request.
      const needle = params.companyName.trim().toLowerCase();
      entries = entries.filter(
        (e) =>
          e.company.toLowerCase().includes(needle) ||
          e.name.toLowerCase().includes(needle) ||
          e.aliases.some((alias) => alias.includes(needle)),
      );
    }
    if (params.platformStatus !== undefined) {
      entries = entries.filter((e) => e.status === params.platformStatus);
    }
    if (params.releaseYear !== undefined) {
      entries = entries.filter((e) => e.releaseYear === params.releaseYear);
    }
    if (params.showEmptyPlatforms !== true) {
      entries = entries.filter((e) => e.gameCount > 0);
    }
    if (params.sort === "name") {
      entries.sort((a, b) =>
        params.order === "desc"
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name),
      );
    } else if (params.sort === "releaseYear") {
      entries.sort((a, b) => {
        const rank = (year: number | null) =>
          year === null ? Number.MAX_SAFE_INTEGER : year;
        const diff = rank(a.releaseYear) - rank(b.releaseYear);
        return params.order === "desc" ? -diff : diff;
      });
    } else if (params.sort === "gameCount") {
      entries.sort((a, b) =>
        params.order === "desc"
          ? b.gameCount - a.gameCount
          : a.gameCount - b.gameCount,
      );
    }
    const total = entries.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit);
    const pageEntries = entries.slice(
      (params.page - 1) * params.limit,
      params.page * params.limit,
    );
    const thumbs = await this.fetchPlatformThumbs(
      pageEntries.map((e) => e.igdbId),
      source,
    );
    return {
      data: pageEntries.map((entry) => toSearchPlatform(entry, thumbs.get(entry.igdbId))),
      pagination: { page: params.page, limit: params.limit, total, totalPages },
    };
  }

  async getPlatform(
    id: string,
    source?: Record<string, string | undefined>,
  ): Promise<SearchPlatform> {
    const numericId = parseIgdbId(id);
    if (numericId === undefined) {
      throw new ApiError("IGDB_GAME_NOT_FOUND", "Platform not found", 404);
    }
    const entry = findCatalogPlatform(numericId);
    if (!entry) {
      // Outside the Save State catalog: degraded live lookup, never invented.
      const payload = await igdbRequest(
        "/platforms",
        `where id = ${numericId}; fields name,generation,platform_logo.url; limit 1;`,
        { timeoutMs: IGDB_DETAIL_TIMEOUT_MS, route: "POST /platforms" },
        source,
      );
      const platforms = igdbPlatformListSchema.parse(payload);
      const platform = platforms[0];
      if (!platform) {
        throw new ApiError("IGDB_GAME_NOT_FOUND", "Platform not found", 404);
      }
      return {
        id: String(platform.id),
        name: platform.name,
        company: "",
        releaseYear: null,
        status: "discontinued",
        family: null,
        type: null,
        generation: platform.generation ?? null,
        thumb: toThumb(platform.platform_logo?.url),
        gameCount: await this.fetchGameCount(numericId, source),
      };
    }
    const thumbs = await this.fetchPlatformThumbs([entry.igdbId], source);
    return toSearchPlatform(
      { ...entry, gameCount: await this.fetchGameCount(entry.igdbId, source).catch(() => entry.gameCount) },
      thumbs.get(entry.igdbId),
    );
  }

  async listFamilies(
    source?: Record<string, string | undefined>,
  ): Promise<SearchFamily[]> {
    const families = new Map<string, IgdbCatalogPlatform[]>();
    for (const entry of IGDB_PLATFORM_CATALOG) {
      const group = families.get(entry.family) ?? [];
      group.push(entry);
      families.set(entry.family, group);
    }
    const allIds = IGDB_PLATFORM_CATALOG.map((e) => e.igdbId);
    const thumbs = await this.fetchPlatformThumbs(allIds, source);
    return [...families.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, platforms]) => ({
        name,
        platforms: platforms.map((entry) =>
          toSearchPlatform(entry, thumbs.get(entry.igdbId)),
        ),
        platformCount: platforms.length,
        gameCount: platforms.reduce((sum, p) => sum + p.gameCount, 0),
      }));
  }

  private async fetchPlatformThumbs(
    ids: number[],
    source?: Record<string, string | undefined>,
  ): Promise<Map<number, { logo: string | null; image: string | null }>> {
    const result = new Map<number, { logo: string | null; image: string | null }>();
    if (ids.length === 0) return result;
    try {
      const payload = await igdbRequest(
        "/platforms",
        `where id = (${ids.join(",")}); fields platform_logo.url; limit ${Math.min(ids.length, 500)};`,
        { timeoutMs: IGDB_DETAIL_TIMEOUT_MS, route: "POST /platforms" },
        source,
      );
      const platforms = igdbPlatformListSchema.parse(payload);
      for (const platform of platforms) {
        result.set(platform.id, {
          logo: toThumb(platform.platform_logo?.url)?.logo ?? null,
          image: toThumb(platform.platform_logo?.url)?.image ?? null,
        });
      }
    } catch {
      // Logos degrade to placeholders rather than failing the listing.
    }
    return result;
  }

  private async fetchGameCount(
    igdbId: number,
    source?: Record<string, string | undefined>,
  ): Promise<number> {
    const payload = await igdbRequest(
      "/games/count",
      `where platforms = (${igdbId});`,
      { timeoutMs: IGDB_DETAIL_TIMEOUT_MS, route: "POST /games/count" },
      source,
    );
    return igdbCountSchema.parse(payload).count;
  }
}

function toThumb(
  url: string | undefined,
): { logo: string | null; image: string | null } | null {
  if (!url) return null;
  const https = url.startsWith("//") ? `https:${url}` : url;
  return {
    logo: https.replace("t_thumb", "t_logo_med"),
    image: https,
  };
}

function toSearchPlatform(
  entry: IgdbCatalogPlatform,
  thumb?: { logo: string | null; image: string | null },
): SearchPlatform {
  return {
    id: String(entry.igdbId),
    name: entry.name,
    company: entry.company,
    releaseYear: entry.releaseYear,
    status: entry.status,
    family: entry.family,
    type: null,
    generation: null,
    thumb: thumb ?? null,
    gameCount: entry.gameCount,
    aliases: [...entry.aliases],
  };
}
