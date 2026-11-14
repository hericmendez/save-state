import { z } from "zod";
import data from "@/atp-platforms-simplified.json";
import { resolveIgdbPlatformIds } from "@/server/search/igdb-platforms";

/**
 * Editorial platform directory (Opção B).
 *
 * Single source of truth for the `/catalog/platforms` listing: the curated
 * local JSON (`atp-platforms-simplified.json`). Order is the JSON order.
 * No provider requests are made to render the listing.
 *
 * `releaseYear` in the JSON is a string ("1993") with one null (`pc`);
 * it is normalized to number|null for compatibility with the neutral
 * `SearchPlatform` contract. `thumb` holds curated local paths
 * (`/platforms/<slug>/...`) or nulls when no asset exists; `thumb` itself
 * may be null (normalized to `{ logo: null, image: null }`).
 */

const editorialThumbSchema = z.object({
  logo: z.string().nullable(),
  image: z.string().nullable(),
});

/**
 * `thumb` aceita `null`/ausente (ausência legítima de imagem: a plataforma
 * existe no catálogo mas não possui asset local) e normaliza para
 * `{ logo: null, image: null }`, preservando o fallback visual do
 * `PlatformCard`. Qualquer outro desvio (ex.: `logo` não-string) continua
 * sendo `ZodError`, sem mascarar inconsistências estruturais.
 */
const editorialRawSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string(),
  releaseYear: z.union([z.string(), z.number(), z.null()]),
  type: z.string(),
  thumb: editorialThumbSchema.nullish(),
});

export interface EditorialPlatform {
  id: string;
  name: string;
  company: string;
  releaseYear: number | null;
  type: string;
  thumb: { logo: string | null; image: string | null };
}

function normalizeReleaseYear(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

function toEditorialPlatform(raw: unknown): EditorialPlatform {
  const parsed = editorialRawSchema.parse(raw);
  const thumb = parsed.thumb ?? { logo: null, image: null };
  return {
    id: parsed.id,
    name: parsed.name,
    company: parsed.company,
    releaseYear: normalizeReleaseYear(parsed.releaseYear),
    type: parsed.type,
    thumb: { logo: thumb.logo, image: thumb.image },
  };
}

const EDITORIAL_PLATFORMS: EditorialPlatform[] = (data as unknown[]).map(
  toEditorialPlatform,
);

/** Editorial order, as curated in the JSON. */
export function listEditorialPlatforms(): EditorialPlatform[] {
  return [...EDITORIAL_PLATFORMS];
}

export function findEditorialPlatform(id: string): EditorialPlatform | null {
  return EDITORIAL_PLATFORMS.find((entry) => entry.id === id) ?? null;
}

/**
 * Detail-route href for an editorial slug (single routing rule shared by
 * the listing and tested directly). Numeric legacy ids never reach here:
 * `findEditorialPlatform` returns null for them and the detail route
 * falls through to the legacy catalog lookup.
 */
export function editorialPlatformHref(editorial: EditorialPlatform): string {
  return `/catalog/platforms/${encodeURIComponent(editorial.id)}`;
}

/**
 * Editorial listing pagination (platforms grid).
 *
 * Paginates the local editorial array (default 16 cards per page) to bound
 * concurrent `next/image` fetches per page without any provider request.
 * The URL is the source of truth (`page`/`limit`), so reload and
 * back/forward work with zero client state; invalid values normalize to
 * predictable defaults.
 */

/** Allowed page sizes for the platforms grid. */
export const PLATFORM_PAGE_SIZES = [8, 12, 16, 24] as const;

export type PlatformPageSize =
  (typeof PLATFORM_PAGE_SIZES)[number];

/** Default page size: 16 cards → at most 32 card images per page. */
export const DEFAULT_PLATFORM_PAGE_SIZE: PlatformPageSize = 16;

export interface PlatformsQuery {
  page: number;
  limit: PlatformPageSize;
}

export type PlatformsQueryInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined;

function firstQueryValue(
  input: Exclude<PlatformsQueryInput, undefined>,
  key: string,
): string | undefined {
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  const value = input[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

/**
 * Parse `page`/`limit` from the URL. Unknown `limit` → 16; non-positive or
 * non-integer `page` → 1. Page clamping against the total happens in
 * {@link paginatePlatforms}, which knows the collection length.
 */
export function parsePlatformsQuery(
  input: PlatformsQueryInput,
): PlatformsQuery {
  if (!input) return { page: 1, limit: DEFAULT_PLATFORM_PAGE_SIZE };
  const limit = parsePositiveInt(
    firstQueryValue(input, "limit"),
    DEFAULT_PLATFORM_PAGE_SIZE,
  );
  return {
    page: parsePositiveInt(firstQueryValue(input, "page"), 1),
    limit: (
      PLATFORM_PAGE_SIZES as readonly number[]
    ).includes(limit)
      ? (limit as PlatformPageSize)
      : DEFAULT_PLATFORM_PAGE_SIZE,
  };
}

/**
 * Slice the editorial array (order preserved) for one page. The page is
 * clamped into `1..totalPages` so out-of-range URLs render the nearest
 * valid page instead of an empty grid.
 */
export function paginatePlatforms(
  platforms: EditorialPlatform[],
  query: PlatformsQuery,
): { items: EditorialPlatform[]; page: number; totalPages: number } {
  const totalPages = Math.max(
    1,
    Math.ceil(platforms.length / query.limit),
  );
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * query.limit;
  return {
    items: platforms.slice(start, start + query.limit),
    page,
    totalPages,
  };
}

/**
 * Serialize pagination state back to a query string. Defaults are omitted
 * so the canonical URL stays clean. Round-trips through
 * {@link parsePlatformsQuery}.
 */
export function serializePlatformsQuery(query: Partial<PlatformsQuery>): string {
  const params = new URLSearchParams();
  if (query.page !== undefined && query.page !== 1) {
    params.set("page", String(query.page));
  }
  if (
    query.limit !== undefined &&
    query.limit !== DEFAULT_PLATFORM_PAGE_SIZE
  ) {
    params.set("limit", String(query.limit));
  }
  return params.toString();
}
/**
 * Local platform assets (vendored editorial images).
 *
 * `public/platforms/<slug>/` holds curated local copies (see
 * `scripts/import-platform-images.mjs` + `manifest.json`) so the grid no
 * longer depends on Wikimedia at runtime. The editorial JSON stays the
 * reference and the remote fallback; entries resolve local-first.
 */
export interface PlatformAssetRef {
  /** Path relative to `public/platforms/`, e.g. `3do/logo.png`. */
  file: string;
  source: string;
  page: string | null;
  license: string;
  licenseUrl: string | null;
  author: string | null;
}

export interface PlatformAssetManifest {
  version: number;
  generatedAt?: string;
  files: Record<string, PlatformAssetRef | undefined>;
}

/**
 * Resolve card images local-first: `/platforms/<file>` when the manifest
 * lists a vendored copy for this platform+kind, otherwise the curated local
 * path from the editorial JSON (possibly null → `PlatformCard` renders its
 * visual fallback). Pure — unit-tested with fixture manifests, no
 * filesystem access.
 */
export function resolvePlatformThumb(
  platform: EditorialPlatform,
  manifest?: PlatformAssetManifest | null,
): { logo: string | null; image: string | null } {
  const pick = (kind: "logo" | "image"): string | null => {
    const entry = manifest?.files[`${platform.id}/${kind}`];
    if (entry && entry.file) return `/platforms/${entry.file}`;
    return platform.thumb[kind];
  };
  return { logo: pick("logo"), image: pick("image") };
}

/**
 * Explicit editorial → IGDB fallback (verified, never invented).
 *
 * Primary resolution is always the editorial NAME via
 * `resolveIgdbPlatformIds` (exact name/alias match). This table covers
 * only the entries whose name has NO match in Save State's IGDB catalog,
 * using the IGDB ids from the verified ATP curation
 * (`atp-platforms-complete.json` → externalIdentities[source=igdb]).
 * `neo-geo` (AES) has no IGDB link there and is intentionally absent:
 * it renders the editorial header with an empty game state.
 */
const EDITORIAL_IGDB_FALLBACK: Record<string, number[]> = {
  "atari-jaguar": [62],
  "atari-jaguar-cd": [410],
  "atari-lynx": [61],
  "coleco-vision": [68],
  evercade: [309],
  intellivision: [67],
  ios: [39],
  odyssey: [88],
  "odyssey-2": [133],
  ouya: [72],
  "pc-amiga": [16],
  "pc-dos": [13],
  "sg-1000": [84],
};

export function resolveEditorialIgdbIds(
  editorial: EditorialPlatform,
): number[] {
  const { ids } = resolveIgdbPlatformIds(editorial.name);
  if (ids.length > 0) return ids;
  return EDITORIAL_IGDB_FALLBACK[editorial.id] ?? [];
}
