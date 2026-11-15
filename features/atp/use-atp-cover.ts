"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { searchCoverEndpoint } from "@/features/search/search-endpoints";

/**
 * Lazy per-item cover lookup (shared by grid cards and table rows).
 * Single implementation: covers resolve lazily per item, never fanned out
 * from the listing. Failures degrade to null (placeholder), never an error.
 *
 * When the search payload already carried the cover (`knownUrl` defined,
 * even null), no fetch is issued — `undefined` preserves the legacy
 * on-demand resolution (ATP list responses carry no cover).
 */
export function shouldResolveCover(
  knownUrl: string | null | undefined,
): boolean {
  return knownUrl === undefined;
}

export function useAtpCover(
  atpId: string,
  knownUrl?: string | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!shouldResolveCover(knownUrl)) return;
    let cancelled = false;
    apiRequest<{ coverUrl: string | null }>(searchCoverEndpoint(atpId))
      .then((result) => {
        if (!cancelled) setUrl(result.coverUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [atpId, knownUrl]);
  return knownUrl ?? url;
}
