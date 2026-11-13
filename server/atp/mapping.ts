/**
 * Deterministic mapping from an ATP GameResponse to a Save State
 * GlobalGame snapshot. Derives Save State's flat shape from ATP's nested
 * structures; never assumes ATP exposes our fields. Total on valid DTOs:
 * missing optional metadata yields empty arrays/undefined, never throws.
 */

import "server-only";
import type { AtpGame } from "@/server/atp/schemas";
import type { AtpCover } from "@/server/atp/client";

export interface GlobalGameSnapshot {
  name: string;
  source: "atp";
  atpDomainId: string;
  cover?: string;
  genres: string[];
  platforms: string[];
  developers: string[];
  publishers: string[];
  releaseDate?: Date;
  summary?: string;
}

function uniqueNames(values: Array<{ name?: string } | string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const name = typeof value === "string" ? value : value.name;
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function primaryTitle(game: AtpGame): string {
  const primary = game.titles.find((title) => title.type === "primary");
  const value = (primary ?? game.titles[0])?.value.trim();
  return value || "Unknown game";
}

function releaseYear(game: AtpGame): Date | undefined {
  for (const release of game.releases) {
    const year = release.releaseDate?.year;
    if (typeof year === "number" && Number.isInteger(year)) {
      return new Date(Date.UTC(year, 0, 1));
    }
  }
  return undefined;
}

function releasePlatforms(game: AtpGame): string[] {
  return uniqueNames(
    game.releases.flatMap((release) =>
      release.platform ? [release.platform] : [],
    ),
  );
}

export function mapAtpGameToSnapshot(
  game: AtpGame,
  cover: AtpCover | null,
): GlobalGameSnapshot {
  const snapshot: GlobalGameSnapshot = {
    name: primaryTitle(game),
    source: "atp",
    atpDomainId: game.id,
    genres: uniqueNames(game.genres),
    platforms: releasePlatforms(game),
    developers: uniqueNames(game.developers),
    publishers: uniqueNames(game.publishers),
  };
  const releaseDate = releaseYear(game);
  if (releaseDate) snapshot.releaseDate = releaseDate;
  if (cover) snapshot.cover = cover.url;
  return snapshot;
}
