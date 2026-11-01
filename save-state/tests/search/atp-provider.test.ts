/**
 * Etapa 2 — ATP provider compatibility boundaries.
 *
 * The ATP Engine exposes no game sorting and a single releaseYear (no
 * range). Sort/year-range requests therefore fail loudly with
 * INVALID_QUERY instead of being silently dropped — the UI only offers
 * them against IGDB. Filters the ATP engine DOES support keep flowing
 * through unchanged (covered by neutral-routes ATP tests).
 */

import { describe, expect, it, vi } from "vitest";
import { AtpSearchProvider } from "@/server/search/atp-provider";

const ATP_CARD_FIXTURE = {
  id: "atp-wikipedia-6509467",
  titles: [{ value: "Chrono Trigger", type: "primary" }],
  releases: [
    {
      platform: { name: "SNES" },
      region: { name: "JP" },
      releaseDate: { year: 1995, month: 3, day: 11, precision: "day" },
    },
    { platform: { name: "PlayStation" }, releaseDate: { year: 1999 } },
  ],
  developers: [{ name: "Square" }],
  publishers: [{ name: "Square" }],
  genres: [{ name: "RPG" }],
  externalIdentifiers: [{ source: "wikipedia", id: "6509467" }],
};

vi.mock("@/server/atp/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/atp/client")>();
  return {
    ...original,
    searchAtpGames: vi.fn(async () => ({
      data: [ATP_CARD_FIXTURE],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })),
  };
});

describe("AtpSearchProvider — Etapa 2 explicit boundaries", () => {
  it("rejects title/year sorts instead of silently ignoring them", async () => {
    const provider = new AtpSearchProvider();
    await expect(
      provider.searchGames({ q: "mario", page: 1, limit: 20, sortBy: "title" }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      provider.searchGames({
        q: "",
        page: 1,
        limit: 20,
        sortBy: "year",
        order: "desc",
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("rejects open or wide year ranges (ATP only knows an exact year)", async () => {
    const provider = new AtpSearchProvider();
    await expect(
      provider.searchGames({ q: "", page: 1, limit: 20, yearMin: 2000 }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      provider.searchGames({ q: "", page: 1, limit: 20, yearMax: 2010 }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      provider.searchGames({
        q: "",
        page: 1,
        limit: 20,
        yearMin: 2000,
        yearMax: 2010,
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("serves relevance queries through the legacy ATP order", async () => {
    const provider = new AtpSearchProvider();
    const page = await provider.searchGames({
      q: "mario",
      page: 1,
      limit: 20,
    });
    expect(page.data).toEqual([
      {
        id: "atp-wikipedia-6509467",
        name: "Chrono Trigger",
        year: 1995,
        platforms: ["SNES", "PlayStation"],
        genres: ["RPG"],
      },
    ]);
    expect(page.pagination.hasNextPage).toBe(false);
  });

  it("maps an exact year (min === max) onto the ATP single-year filter", async () => {
    const { searchAtpGames } = await import("@/server/atp/client");
    const provider = new AtpSearchProvider();
    await provider.searchGames({
      q: "",
      page: 1,
      limit: 20,
      yearMin: 1995,
      yearMax: 1995,
    });
    expect(vi.mocked(searchAtpGames)).toHaveBeenCalledWith(
      expect.objectContaining({ year: 1995 }),
    );
  });
});
