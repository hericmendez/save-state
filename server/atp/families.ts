/**
 * ATP families — derived server-side, never persisted.
 *
 * ATP has no families endpoint; family is a facet of platform data
 * (releases[].platform.family). This module composes the existing
 * platforms/summary listing (already-validated flat shape) and groups it:
 * at most ceil(total/100) internal reads, one per page, then a single
 * grouped response. No client fan-out, no N+1, no Mongo collection.
 */

import "server-only";
import { listAtpPlatforms } from "@/server/atp/client";
import type { AtpPlatform } from "@/server/atp/schemas";

/** Editorial bucket label for platforms without an ATP family (UI-only). */
export const UNGROUPED_FAMILY_NAME = "Outras";

export interface AtpFamilySummary {
  name: string;
  platforms: AtpPlatform[];
  platformCount: number;
  gameCount: number;
}

export function groupPlatformsByFamily(
  platforms: AtpPlatform[],
): AtpFamilySummary[] {
  const filtered = platforms.filter((platform) => platform.gameCount > 0);
  const groups = new Map<string, AtpPlatform[]>();
  for (const platform of filtered) {
    const family = platform.family?.trim() || UNGROUPED_FAMILY_NAME;
    const members = groups.get(family);
    if (members) members.push(platform);
    else groups.set(family, [platform]);
  }
  return [...groups.entries()]
    .map(([name, members]) => ({
      name,
      platforms: [...members].sort((a, b) => a.name.localeCompare(b.name)),
      platformCount: members.length,
      gameCount: members.reduce((sum, p) => sum + p.gameCount, 0),
    }))
    .filter((family) => family.platformCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAtpFamilies(): Promise<AtpFamilySummary[]> {
  const first = await listAtpPlatforms({
    page: 1,
    limit: 100,
    showEmptyPlatforms: false,
  });
  const platforms = [...first.data];
  const totalPages = first.pagination.totalPages;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        listAtpPlatforms({
          page: index + 2,
          limit: 100,
          showEmptyPlatforms: false,
        }),
      ),
    );
    for (const page of rest) platforms.push(...page.data);
  }
  return groupPlatformsByFamily(platforms);
}
