/**
 * Save State-specific ATP search card shaping. Kept outside the route
 * module because Next.js route files may only export HTTP handlers.
 */

import "server-only";
import type { AtpGame } from "@/server/atp/schemas";

export interface AtpSearchCard {
  atpId: string;
  name: string;
  year: number | null;
  platforms: string[];
  genres: string[];
}

function primaryName(game: AtpGame): string {
  const primary = game.titles.find((title) => title.type === "primary");
  return (primary ?? game.titles[0])?.value.trim() || "Unknown game";
}

function firstYear(game: AtpGame): number | null {
  for (const release of game.releases) {
    const year = release.releaseDate?.year;
    if (typeof year === "number") return year;
  }
  return null;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export function toAtpSearchCard(game: AtpGame): AtpSearchCard {
  return {
    atpId: game.id,
    name: primaryName(game),
    year: firstYear(game),
    platforms: uniqueStrings(
      game.releases.map((release) => release.platform?.name),
    ),
    genres: uniqueStrings(game.genres.map((genre) => genre.name)),
  };
}
