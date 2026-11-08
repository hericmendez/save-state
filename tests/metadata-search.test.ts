import { describe, expect, it } from "vitest";
import {
  atpDetailToFormPatch,
  type AtpDetailForForm,
} from "@/features/games/metadata-search";

function detail(overrides: Partial<AtpDetailForForm> = {}): AtpDetailForForm {
  return {
    atpId: "atp-wikipedia-6509467",
    name: "Chrono Trigger",
    coverUrl: "https://img.example/c.jpg",
    genres: ["RPG"],
    platforms: ["SNES", "PlayStation"],
    developers: ["Square"],
    publishers: ["Square"],
    summary: null,
    releases: [
      { year: 1995, month: 3, day: 11 },
      { year: 1999, month: null, day: null },
    ],
    ...overrides,
  };
}

describe("atpDetailToFormPatch", () => {
  it("maps a full detail into form fields", () => {
    expect(atpDetailToFormPatch(detail())).toEqual({
      name: "Chrono Trigger",
      cover: "https://img.example/c.jpg",
      genres: "RPG",
      platforms: "SNES, PlayStation",
      developers: "Square",
      publishers: "Square",
      releaseDate: "1995-03-11",
    });
  });

  it("pads single-digit month and day", () => {
    const patch = atpDetailToFormPatch(
      detail({ releases: [{ year: 2001, month: 1, day: 5 }] }),
    );
    expect(patch.releaseDate).toBe("2001-01-05");
  });

  it("omits releaseDate when only the year is known (never invents month/day)", () => {
    const patch = atpDetailToFormPatch(
      detail({ releases: [{ year: 1999, month: null, day: null }] }),
    );
    expect(patch).not.toHaveProperty("releaseDate");
  });

  it("omits releaseDate when no release has a date", () => {
    const patch = atpDetailToFormPatch(detail({ releases: [] }));
    expect(patch).not.toHaveProperty("releaseDate");
  });

  it("ignores out-of-range month/day instead of producing invalid dates", () => {
    const patch = atpDetailToFormPatch(
      detail({ releases: [{ year: 1999, month: 13, day: 40 }] }),
    );
    expect(patch).not.toHaveProperty("releaseDate");
  });

  it("omits empty arrays and blank values so manual input is preserved", () => {
    const patch = atpDetailToFormPatch(
      detail({
        name: "   ",
        coverUrl: null,
        genres: [],
        platforms: [],
        developers: [],
        publishers: [],
        releases: [],
      }),
    );
    expect(patch).toEqual({});
  });

  it("dedupes and trims list values", () => {
    const patch = atpDetailToFormPatch(
      detail({
        genres: ["RPG", " rpg ", "RPG", ""],
        developers: ["Square", "Square"],
      }),
    );
    expect(patch.genres).toBe("RPG, rpg");
    expect(patch.developers).toBe("Square");
  });

  it("fills summary from ATP description when present", () => {
    const patch = atpDetailToFormPatch(
      detail({ summary: "  A time-traveling RPG.  " }),
    );
    expect(patch.summary).toBe("A time-traveling RPG.");
  });

  it("leaves summary untouched when ATP has no description", () => {
    const patch = atpDetailToFormPatch(detail({ summary: null }));
    expect(patch).not.toHaveProperty("summary");
    const blank = atpDetailToFormPatch(detail({ summary: "   " }));
    expect(blank).not.toHaveProperty("summary");
  });

  it("fills only what ATP provides and never invents fields", () => {
    // Sparse catalog data (e.g. no developers, no summary) is omitted,
    // never blanked or nulled — manual input is preserved.
    const patch = atpDetailToFormPatch(
      detail({
        name: "Dark Souls III",
        coverUrl: null,
        genres: ["Action", "RPG"],
        platforms: ["PlayStation 4", "PC"],
        developers: [],
        publishers: [],
        releases: [],
      }),
    );
    expect(patch).toEqual({
      name: "Dark Souls III",
      genres: "Action, RPG",
      platforms: "PlayStation 4, PC",
    });
    expect(patch).not.toHaveProperty("summary");
    expect(patch).not.toHaveProperty("developers");
    expect(patch).not.toHaveProperty("publishers");
    expect(patch).not.toHaveProperty("releaseDate");
  });
});
