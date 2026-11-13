/**
 * Atlas seed orchestrator: 30 real catalog games linked to one test user.
 *
 * Runs against MongoDB Atlas through the existing domain services
 * (registerUser, createGame) — no raw writes except guarded idempotency
 * lookups, no drops, no mass deletes. Safe to rerun: existing GlobalGame
 * and UserGame records are reused as-is, and only absent metadata fields
 * are ever backfilled (manual edits are never overwritten).
 *
 * Catalog metadata comes from the configured search provider (IGDB) when
 * reachable. When a title cannot be confirmed externally, a minimal manual
 * record (official name + reference platform) is stored instead of invented
 * metadata, and the gap is reported in the run summary.
 */

import "server-only";
import slugify from "slugify";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { GlobalGame, type GlobalGameDocument } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { User } from "@/db/models/user";
import { registerUser } from "@/server/auth/service";
import { createGame } from "@/server/games/service";
import { GAME_STATUSES, type GameStatus } from "@/schemas/games";
import type {
  SearchCard,
  SearchPreview,
  SearchProvider,
} from "@/server/search/types";

export interface AtlasSeedGame {
  /** Official title (display name / IGDB search query). */
  title: string;
  /** Stable catalog key. Derived from the title; never timestamped. */
  slug: string;
  /**
   * Reference platform of the original or representative edition, using
   * Save State IGDB catalog names. Guides provider match selection and is
   * the only platform stored when external metadata is unreachable.
   */
  platform: string;
  /** Library status for the test user's copy (distributed across all). */
  status: GameStatus;
}

function seedEntry(title: string, platform: string): AtlasSeedGame {
  return {
    title,
    slug: slugify(title, { lower: true, strict: true }),
    platform,
    status: "backlog",
  };
}

const RAW_ENTRIES: Array<[string, string]> = [
  ["The Legend of Zelda: Ocarina of Time", "Nintendo 64"],
  ["Super Mario World", "Super Nintendo Entertainment System"],
  ["Super Metroid", "Super Nintendo Entertainment System"],
  ["Chrono Trigger", "Super Nintendo Entertainment System"],
  ["Final Fantasy VII", "PlayStation"],
  ["Castlevania: Symphony of the Night", "PlayStation"],
  ["Metal Gear Solid", "PlayStation"],
  ["Resident Evil 2", "PlayStation"],
  ["Silent Hill 2", "PlayStation 2"],
  ["Shadow of the Colossus", "PlayStation 2"],
  ["Devil May Cry 3: Dante's Awakening", "PlayStation 2"],
  ["Kingdom Hearts II", "PlayStation 2"],
  ["God of War II", "PlayStation 2"],
  ["Pokémon Emerald", "Game Boy Advance"],
  ["Metroid Prime", "Nintendo GameCube"],
  ["The Legend of Zelda: The Wind Waker", "Nintendo GameCube"],
  ["Half-Life 2", "PC (Microsoft Windows)"],
  ["Portal 2", "PC (Microsoft Windows)"],
  ["BioShock", "Xbox 360"],
  ["Mass Effect 2", "Xbox 360"],
  ["Dark Souls", "PlayStation 3"],
  ["The Elder Scrolls V: Skyrim", "PC (Microsoft Windows)"],
  ["Grand Theft Auto V", "PlayStation 3"],
  ["The Witcher 3: Wild Hunt", "PC (Microsoft Windows)"],
  ["Bloodborne", "PlayStation 4"],
  ["Hollow Knight", "PC (Microsoft Windows)"],
  ["Stardew Valley", "PC (Microsoft Windows)"],
  ["Red Dead Redemption 2", "PlayStation 4"],
  ["Elden Ring", "PC (Microsoft Windows)"],
  ["Baldur's Gate 3", "PC (Microsoft Windows)"],
];

/**
 * The 30 seeded titles. Statuses round-robin over the canonical vocabulary
 * so every Backlog view has data to exercise.
 */
export const ATLAS_SEED_GAMES: AtlasSeedGame[] = RAW_ENTRIES.map(
  ([title, platform], index) => ({
    ...seedEntry(title, platform),
    status: GAME_STATUSES[index % GAME_STATUSES.length],
  }),
);

/** Classify a MongoDB connection string without exposing credentials. */
export function classifyMongoUri(uri: string): "atlas" | "local" | "other" {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return "other";
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === "mongodb+srv:" || host.endsWith(".mongodb.net")) {
    return "atlas";
  }
  if (
    parsed.protocol === "mongodb:" &&
    (host === "localhost" || host === "127.0.0.1")
  ) {
    return "local";
  }
  return "other";
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Pick the provider result matching the seeded title. Pure: unit-tested.
 *
 * Preference order: exact normalized name → name prefix → any result;
 * within each tier, prefer the reference platform, then the earliest known
 * release year (originals predate remakes/remasters), then the richest
 * platform list (canonical entries aggregate re-releases while edition
 * duplicates list a single storefront). Unknown years sort last.
 * Returns undefined when there is nothing to choose from.
 */
export function pickProviderMatch(
  query: string,
  platform: string,
  cards: SearchCard[],
): SearchCard | undefined {
  if (cards.length === 0) return undefined;
  const wanted = normalizeName(query);
  const wantedPlatform = normalizeName(platform);
  const exact = cards.filter((c) => normalizeName(c.name) === wanted);
  const prefixed =
    exact.length > 0
      ? exact
      : cards.filter((c) => normalizeName(c.name).startsWith(wanted));
  const pool = prefixed.length > 0 ? prefixed : cards;
  const onPlatform = pool.filter((c) =>
    c.platforms.some((p) => normalizeName(p) === wantedPlatform),
  );
  const ranked = (onPlatform.length > 0 ? onPlatform : pool).slice().sort((a, b) => {
    const yearA = a.year ?? Number.MAX_SAFE_INTEGER;
    const yearB = b.year ?? Number.MAX_SAFE_INTEGER;
    if (yearA !== yearB) return yearA - yearB;
    if (b.platforms.length !== a.platforms.length) {
      return b.platforms.length - a.platforms.length;
    }
    return a.name.length - b.name.length;
  });
  return ranked[0];
}

export interface ProviderDetail
  extends Omit<SearchPreview, "manualDuplicate" | "owned"> {}

export interface AtlasSeedProvider {
  searchGames(
    params: { q: string; page: number; limit: number; platform?: string },
    source?: Record<string, string | undefined>,
  ): Promise<{ data: SearchCard[] }>;
  getGameDetail(
    id: string,
    source?: Record<string, string | undefined>,
  ): Promise<ProviderDetail>;
}

export function asAtlasSeedProvider(provider: SearchProvider): AtlasSeedProvider {
  return {
    searchGames: (params, source) => provider.searchGames(params, source),
    getGameDetail: (id, source) => provider.getGameDetail(id, source),
  };
}

export interface AtlasSeedFailure {
  slug: string;
  title: string;
  reason: string;
}

export interface AtlasSeedSummary {
  userReused: boolean;
  globalCreated: number;
  globalReused: number;
  globalBackfilled: number;
  libraryCreated: number;
  libraryKept: number;
  incomplete: string[];
  failures: AtlasSeedFailure[];
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

function failureReason(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

interface GlobalSnapshot {
  name: string;
  source: "manual" | "igdb";
  igdbId?: number;
  cover?: string;
  genres: string[];
  platforms: string[];
  developers: string[];
  publishers: string[];
  releaseDate?: Date;
  summary?: string;
}

function snapshotFromDetail(detail: ProviderDetail): GlobalSnapshot {
  const igdbId = Number(detail.id);
  return {
    name: detail.name,
    source: "igdb",
    ...(Number.isSafeInteger(igdbId) && igdbId > 0 ? { igdbId } : {}),
    ...(detail.coverUrl ? { cover: detail.coverUrl } : {}),
    genres: detail.genres,
    platforms: detail.platforms,
    developers: detail.developers,
    publishers: detail.publishers,
    ...(typeof detail.year === "number"
      ? { releaseDate: new Date(Date.UTC(detail.year, 0, 1)) }
      : {}),
    ...(detail.summary ? { summary: detail.summary } : {}),
  };
}

function fallbackSnapshot(entry: AtlasSeedGame): GlobalSnapshot {
  return {
    name: entry.title,
    source: "manual",
    genres: [],
    platforms: [entry.platform],
    developers: [],
    publishers: [],
  };
}

/**
 * Fill only absent metadata on an existing catalog record. Never overwrites
 * stored values, so manual edits and previous seeds survive reruns.
 * Returns true when the document changed.
 */
function backfillMissing(
  doc: GlobalGameDocument,
  snapshot: GlobalSnapshot,
): boolean {
  let changed = false;
  if (doc.igdbId === undefined && snapshot.igdbId !== undefined) {
    doc.igdbId = snapshot.igdbId;
    doc.source = "igdb";
    changed = true;
  }
  if (!doc.cover && snapshot.cover) {
    doc.cover = snapshot.cover;
    changed = true;
  }
  if (doc.genres.length === 0 && snapshot.genres.length > 0) {
    doc.genres = snapshot.genres;
    changed = true;
  }
  if (doc.platforms.length === 0 && snapshot.platforms.length > 0) {
    doc.platforms = snapshot.platforms;
    changed = true;
  }
  if (doc.developers.length === 0 && snapshot.developers.length > 0) {
    doc.developers = snapshot.developers;
    changed = true;
  }
  if (doc.publishers.length === 0 && snapshot.publishers.length > 0) {
    doc.publishers = snapshot.publishers;
    changed = true;
  }
  if (!doc.releaseDate && snapshot.releaseDate) {
    doc.releaseDate = snapshot.releaseDate;
    changed = true;
  }
  if (!doc.summary && snapshot.summary) {
    doc.summary = snapshot.summary;
    changed = true;
  }
  return changed;
}

async function findOrCreateGlobalGame(
  entry: AtlasSeedGame,
  snapshot: GlobalSnapshot,
  summary: AtlasSeedSummary,
): Promise<GlobalGameDocument> {
  if (snapshot.igdbId !== undefined) {
    const byExternalId = await GlobalGame.findOne({ igdbId: snapshot.igdbId });
    if (byExternalId) {
      if (backfillMissing(byExternalId, snapshot)) {
        await byExternalId.save();
        summary.globalBackfilled += 1;
      } else {
        summary.globalReused += 1;
      }
      return byExternalId;
    }
  }
  const bySlug = await GlobalGame.findOne({ slug: entry.slug });
  if (bySlug) {
    if (backfillMissing(bySlug, snapshot)) {
      await bySlug.save();
      summary.globalBackfilled += 1;
    } else {
      summary.globalReused += 1;
    }
    return bySlug;
  }
  try {
    const created = await GlobalGame.create({ slug: entry.slug, ...snapshot });
    summary.globalCreated += 1;
    return created;
  } catch (error) {
    // A concurrent seed won the race on the unique slug/igdbId index;
    // the database stays authoritative — reuse the winner.
    if (isDuplicateKeyError(error)) {
      const winner =
        snapshot.igdbId !== undefined
          ? await GlobalGame.findOne({ igdbId: snapshot.igdbId })
          : null;
      const bySlugWinner = winner ?? (await GlobalGame.findOne({ slug: entry.slug }));
      if (bySlugWinner) {
        summary.globalReused += 1;
        return bySlugWinner;
      }
    }
    throw error;
  }
}

async function resolveDetail(
  provider: AtlasSeedProvider,
  entry: AtlasSeedGame,
): Promise<ProviderDetail | undefined> {
  const search = async (platform?: string) =>
    provider.searchGames({ q: entry.title, page: 1, limit: 10, ...(platform ? { platform } : {}) });
  let cards: SearchCard[] = [];
  try {
    cards = (await search(entry.platform)).data;
    if (cards.length === 0) cards = (await search()).data;
  } catch {
    return undefined;
  }
  const match = pickProviderMatch(entry.title, entry.platform, cards);
  if (!match) return undefined;
  try {
    return await provider.getGameDetail(match.id);
  } catch {
    return undefined;
  }
}

export interface RunAtlasSeedInput {
  provider: AtlasSeedProvider;
  email: string;
  password: string;
  /** Display name for a newly created test user. */
  name?: string;
}

/**
 * Seed the 30-title catalog and link every title to the test user.
 * Throws on missing credentials; per-title failures are collected in the
 * summary so one provider hiccup cannot abort the remaining titles.
 */
export async function runAtlasSeed(input: RunAtlasSeedInput): Promise<AtlasSeedSummary> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("seed user email is required");
  if (!input.password) throw new Error("seed user password is required");
  // Atlas seeds must never provision indexes as an incidental side effect.
  // Index readiness is verified read-only; structural changes belong to B-01.
  await connectDatabase({ readOnlyIndexes: true });

  const summary: AtlasSeedSummary = {
    userReused: false,
    globalCreated: 0,
    globalReused: 0,
    globalBackfilled: 0,
    libraryCreated: 0,
    libraryKept: 0,
    incomplete: [],
    failures: [],
  };

  const existingUser = await User.findOne({ email }).lean();
  let userId: string;
  if (existingUser) {
    // Reuse as-is: never reset the password or touch profile data.
    userId = String(existingUser._id);
    summary.userReused = true;
  } else {
    try {
      const created = await registerUser({
        name: input.name ?? "Test Player",
        email,
        password: input.password,
      });
      userId = String(created._id);
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_ALREADY_IN_USE") {
        const winner = await User.findOne({ email }).lean();
        if (!winner) throw error;
        userId = String(winner._id);
        summary.userReused = true;
      } else {
        throw error;
      }
    }
  }

  for (const entry of ATLAS_SEED_GAMES) {
    try {
      const detail = await resolveDetail(input.provider, entry);
      const snapshot = detail ? snapshotFromDetail(detail) : fallbackSnapshot(entry);
      const global = await findOrCreateGlobalGame(entry, snapshot, summary);
      if (global.source === "manual" && !summary.incomplete.includes(entry.slug)) {
        summary.incomplete.push(entry.slug);
      }

      const owned = await UserGame.findOne({ userId, gameId: global._id }).lean();
      if (owned) {
        summary.libraryKept += 1;
        continue;
      }
      await createGame({ userId, gameId: String(global._id), status: entry.status });
      summary.libraryCreated += 1;
    } catch (error) {
      summary.failures.push({ slug: entry.slug, title: entry.title, reason: failureReason(error) });
    }
  }

  return summary;
}
