/**
 * SearchService — single owner of provider selection (Etapa 2).
 *
 * This module is the ONLY place allowed to read SEARCH_METHOD.
 * Route Handlers, Server Components and the frontend must call
 * getSearchProvider() and never branch on the env var themselves.
 */

import "server-only";
import { loadServerEnv } from "@/lib/env";
import { AtpSearchProvider } from "@/server/search/atp-provider";
import { IgdbSearchProvider } from "@/server/search/igdb-provider";
import type { SearchProvider, SearchProviderName } from "@/server/search/types";

export function getSearchProviderName(
  source?: Record<string, string | undefined>,
): SearchProviderName {
  return loadServerEnv(source).SEARCH_METHOD;
}

export function getSearchProvider(
  source?: Record<string, string | undefined>,
): SearchProvider {
  const name = getSearchProviderName(source);
  if (name === "ATP") return new AtpSearchProvider();
  return new IgdbSearchProvider();
}

/** Test-only: assert no other module needs the raw env key. */
export const SEARCH_METHOD_ENV_KEY = "SEARCH_METHOD" as const;

/**
 * Forced-IGDB source override for the Novo Jogo metadata/cover lookup
 * (Etapa 5 exception): those lookups always use IGDB, regardless of the
 * active SEARCH_METHOD. Builds a plain (uncached) env record so tests
 * and routes never mutate process.env.
 */
export function igdbForcedSource(
  source: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  return { ...source, SEARCH_METHOD: "IGDB" };
}
