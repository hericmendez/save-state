/**
 * ATP-backed SearchProvider (Etapa 2).
 *
 * Thin adapter: delegates every read to the existing server/atp/* BFF
 * client and translates ATP shapes to the neutral search contract.
 * No behavior change — the neutral /api/search/* routes serve exactly
 * what /api/atp/* serves when SEARCH_METHOD=ATP.
 */

import "server-only";
import { ApiError } from "@/lib/api-error";
import {
  getAtpGame,
  getAtpGameCover,
  getAtpPlatform,
  listAtpPlatforms,
  searchAtpCovers,
  searchAtpGames,
} from "@/server/atp/client";
import { toAtpSearchCard } from "@/server/atp/cards";
import { isStableAtpIdentity } from "@/server/atp/identity";
import { listAtpFamilies } from "@/server/atp/families";
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

function toNeutralCover(
  cover: { url: string; width: number | null; height: number | null; source: string | null } | null,
): SearchCover | null {
  if (!cover) return null;
  return { url: cover.url, width: cover.width, height: cover.height, source: cover.source };
}

export class AtpSearchProvider implements SearchProvider {
  readonly providerName = "ATP" as const;

  async searchGames(params: SearchQueryParams) {
    // The ATP Engine exposes no game sorting: the neutral sort has no
    // ATP translation, so requesting one fails loudly instead of being
    // silently dropped. "relevance"/absent keeps the legacy ATP order.
    if (params.sortBy === "title" || params.sortBy === "year") {
      throw new ApiError(
        "INVALID_QUERY",
        "Sorting is not supported by the ATP provider",
        400,
      );
    }
    // ATP exposes a single releaseYear, not a range. An exact year
    // (min === max) maps 1:1; open or wide ranges cannot be expressed.
    const { yearMin, yearMax } = params;
    let year: number | undefined;
    if (yearMin !== undefined || yearMax !== undefined) {
      if (yearMin === undefined || yearMax === undefined || yearMin !== yearMax) {
        throw new ApiError(
          "INVALID_QUERY",
          "Year ranges are not supported by the ATP provider",
          400,
        );
      }
      year = yearMin;
    }
    const result = await searchAtpGames({ ...params, year });
    const cards = result.data
      .filter((game) => isStableAtpIdentity(game.id))
      .map(toAtpSearchCard)
      .map((card) => ({
        id: card.atpId,
        name: card.name,
        year: card.year,
        platforms: card.platforms,
        genres: card.genres,
      }));
    const { page, limit, total, totalPages } = result.pagination;
    return {
      data: cards,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getGameDetail(id: string): Promise<Omit<SearchPreview, "manualDuplicate" | "owned">> {
    const game = await getAtpGame(id);
    const cover = await getAtpGameCover(id).catch(() => null);
    const primary =
      game.titles.find((t) => t.type === "primary")?.value.trim() ||
      game.titles[0]?.value.trim() ||
      "Unknown game";
    let year: number | null = null;
    for (const release of game.releases) {
      const y = release.releaseDate?.year;
      if (typeof y === "number") {
        year = y;
        break;
      }
    }
    const unique = (values: Array<string | undefined>): string[] => {      const seen = new Set<string>();
      const out: string[] = [];
      for (const v of values) {
        if (typeof v !== "string") continue;
        const t = v.trim();
        if (t && !seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
      return out;
    };
    return {
      id: game.id,
      name: primary,
      year,
      platforms: unique(game.releases.map((r) => r.platform?.name)),
      developers: unique(game.developers.map((d) => d.name)),
      publishers: unique(game.publishers.map((p) => p.name)),
      genres: unique(game.genres.map((g) => g.name)),
      summary: game.description ?? null,
      releases: game.releases.map((r) => ({
        platform: r.platform?.name ?? null,
        region: r.region?.name ?? null,
        year: r.releaseDate?.year ?? null,
        month: r.releaseDate?.month ?? null,
        day: r.releaseDate?.day ?? null,
        precision: r.releaseDate?.precision ?? null,
        version: r.version ?? null,
        edition: r.edition ?? null,
      })),
      externalIdentifiers: game.externalIdentifiers.map((e) => ({
        source: e.source,
        id: e.id,
      })),
      coverUrl: cover?.url ?? null,
    };
  }

  async getGameCover(id: string): Promise<SearchCover | null> {
    const cover = await getAtpGameCover(id);
    return toNeutralCover(cover);
  }

  async searchCovers(params: { q: string; limit: number }): Promise<SearchCover[]> {
    const candidates = await searchAtpCovers(params);
    return candidates.map((c) => ({
      url: c.url,
      width: c.width,
      height: c.height,
      source: c.source,
    }));
  }

  async listPlatforms(params: SearchPlatformListParams): Promise<SearchPlatformList> {
    const result = await listAtpPlatforms(params);
    const data: SearchPlatform[] = result.data.map((p) => ({
      id: p.id,
      name: p.name,
      company: p.company,
      releaseYear: p.releaseYear ?? null,
      status: p.status,
      family: p.family ?? null,
      type: p.type ?? null,
      generation: p.generation ?? null,
      thumb: p.thumb
        ? { logo: p.thumb.logo, image: p.thumb.image }
        : null,
      gameCount: p.gameCount,
    }));
    return { data, pagination: result.pagination };
  }

  async getPlatform(id: string): Promise<SearchPlatform> {
    const p = await getAtpPlatform(id);
    return {
      id: p.id,
      name: p.name,
      company: p.company,
      releaseYear: p.releaseYear ?? null,
      status: p.status,
      family: p.family ?? null,
      type: p.type ?? null,
      generation: p.generation ?? null,
      thumb: p.thumb ? { logo: p.thumb.logo, image: p.thumb.image } : null,
      gameCount: p.gameCount,
    };
  }

  async listFamilies(): Promise<SearchFamily[]> {
    const groups = await listAtpFamilies();
    return groups.map((g) => ({
      name: g.name,
      platforms: g.platforms.map((p) => ({
        id: p.id,
        name: p.name,
        company: p.company,
        releaseYear: p.releaseYear ?? null,
        status: p.status,
        family: p.family ?? null,
        type: p.type ?? null,
        generation: p.generation ?? null,
        thumb: p.thumb
          ? { logo: p.thumb.logo, image: p.thumb.image }
          : null,
        gameCount: p.gameCount,
      })),
      platformCount: g.platforms.length,
      gameCount: g.platforms.reduce((sum, p) => sum + p.gameCount, 0),
    }));
  }
}
