/**
 * Neutral search endpoints (Etapa 2).
 *
 * The ONLY place in the frontend allowed to know the /api/search/*
 * paths. Components call these helpers and never hardcode a provider
 * prefix (/api/atp/*, /api/igdb/*). Provider selection happens
 * exclusively in the backend via SEARCH_METHOD.
 *
 * Exception (Etapa 5): the Novo Jogo metadata/cover lookup always uses
 * IGDB directly via the igdb* helpers below, regardless of SEARCH_METHOD.
 */

export function searchEndpoint(queryString: string): string {
  return `/api/search?${queryString}`;
}

export function searchDetailEndpoint(externalId: string): string {
  return `/api/search/games/${encodeURIComponent(externalId)}`;
}

export function searchCoverEndpoint(externalId: string): string {
  return `/api/search/games/${encodeURIComponent(externalId)}/cover`;
}

export function searchCoversEndpoint(queryString: string): string {
  return `/api/search/covers/search?${queryString}`;
}

export function searchImportEndpoint(): string {
  return "/api/search/import";
}

/**
 * Neutral catalog→library bridge. The backend resolves the neutral
 * external id against Save State's own GlobalGame identities
 * (igdbId / atpDomainId) — the frontend never picks a provider.
 */
export function libraryByExternalEndpoint(externalId: string): string {
  return `/api/games/by-external/${encodeURIComponent(externalId)}`;
}

/**
 * Direct IGDB endpoints for the Novo Jogo lookup (Etapa 5 exception).
 * These always resolve through the IGDB provider, even when the active
 * SEARCH_METHOD is ATP.
 */
export function igdbSearchEndpoint(queryString: string): string {
  return `/api/igdb/search?${queryString}`;
}

export function igdbDetailEndpoint(externalId: string): string {
  return `/api/igdb/games/${encodeURIComponent(externalId)}`;
}

export function igdbCoversEndpoint(queryString: string): string {
  return `/api/igdb/covers/search?${queryString}`;
}
