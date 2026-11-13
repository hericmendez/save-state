/**
 * Pure adapter between the ATP game-detail boundary and GameFormState.
 * No JSX, no fetch: maps an already-fetched BFF detail payload into a
 * form patch. Arrays become the comma-separated strings GameForm edits;
 * releaseDate is filled only from a complete calendar date (never an
 * invented month/day); summary comes from ATP description when present.
 */

import type { GameFormState } from "@/features/games/game-form";

export interface AtpDetailForForm {
  readonly atpId: string;
  readonly name: string;
  readonly coverUrl: string | null;
  readonly genres: readonly string[];
  readonly platforms: readonly string[];
  readonly developers: readonly string[];
  readonly publishers: readonly string[];
  readonly summary: string | null;
  readonly releases: ReadonlyArray<{
    readonly year: number | null;
    readonly month: number | null;
    readonly day: number | null;
  }>;
}

function joinNames(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result.length > 0 ? result.join(", ") : undefined;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function completeReleaseDate(
  releases: AtpDetailForForm["releases"],
): string | undefined {
  for (const release of releases) {
    if (
      typeof release.year === "number" &&
      Number.isInteger(release.year) &&
      typeof release.month === "number" &&
      Number.isInteger(release.month) &&
      release.month >= 1 &&
      release.month <= 12 &&
      typeof release.day === "number" &&
      Number.isInteger(release.day) &&
      release.day >= 1 &&
      release.day <= 31
    ) {
      return `${release.year}-${pad2(release.month)}-${pad2(release.day)}`;
    }
  }
  return undefined;
}

export function atpDetailToFormPatch(
  detail: AtpDetailForForm,
): Partial<GameFormState> {
  const patch: Partial<GameFormState> = {};
  const name = detail.name.trim();
  if (name) patch.name = name;
  if (detail.coverUrl) patch.cover = detail.coverUrl;
  const genres = joinNames(detail.genres);
  if (genres !== undefined) patch.genres = genres;
  const platforms = joinNames(detail.platforms);
  if (platforms !== undefined) patch.platforms = platforms;
  const developers = joinNames(detail.developers);
  if (developers !== undefined) patch.developers = developers;
  const publishers = joinNames(detail.publishers);
  if (publishers !== undefined) patch.publishers = publishers;
  const summary = detail.summary?.trim() ?? "";
  if (summary) patch.summary = summary;
  const releaseDate = completeReleaseDate(detail.releases);
  if (releaseDate !== undefined) patch.releaseDate = releaseDate;
  return patch;
}
