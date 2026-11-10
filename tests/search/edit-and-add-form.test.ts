/**
 * "Editar jogo e adicionar" — form-side wiring (no DOM: pure adapters and
 * source-pattern assertions, matching the repo's node-environment suites).
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { atpDetailToFormPatch } from "@/features/games/metadata-search";
import { EMPTY_GAME_FORM, formToPayload } from "@/features/games/game-form";
import { searchImportSchema } from "@/schemas/search";

function hasPattern(path: string, patterns: string[]): boolean {
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

describe("IGDB detail → form patch (neutral SearchPreview shape)", () => {
  it("maps an IGDB detail onto the form with an id→atpId adaptation", () => {
    const igdbDetail = {
      id: "1234",
      name: "Chrono Trigger",
      coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg",
      genres: ["Role-playing (RPG)"],
      platforms: ["Super Nintendo Entertainment System"],
      developers: ["Square"],
      publishers: ["Square Enix"],
      summary: "A time-travel RPG.",
      releases: [{ year: 1995, month: 3, day: 11 }],
    };
    const patch = atpDetailToFormPatch({
      ...igdbDetail,
      atpId: igdbDetail.id,
    });
    expect(patch).toEqual({
      name: "Chrono Trigger",
      cover: igdbDetail.coverUrl,
      genres: "Role-playing (RPG)",
      platforms: "Super Nintendo Entertainment System",
      developers: "Square",
      publishers: "Square Enix",
      summary: "A time-travel RPG.",
      releaseDate: "1995-03-11",
    });
  });

  it("omits incomplete release dates instead of inventing them", () => {
    const patch = atpDetailToFormPatch({
      atpId: "1234",
      name: "Game",
      coverUrl: null,
      genres: [],
      platforms: [],
      developers: [],
      publishers: [],
      summary: null,
      releases: [{ year: 1995, month: null, day: null }],
    });
    expect(patch.releaseDate).toBeUndefined();
    expect(patch.cover).toBeUndefined();
  });
});

describe("form personal → import personal contract", () => {
  it("maps a fully filled form onto a valid import personal payload", () => {
    const { game: _game, ...personal } = formToPayload({
      ...EMPTY_GAME_FORM,
      name: "Chrono Trigger",
      status: "playing",
      hoursPlayed: "12",
      timesFinished: "1",
      rating: "9",
      favorite: true,
      fullyCompleted: false,
      achievements: true,
      achievementProgress: "80",
    });
    const parsed = searchImportSchema.safeParse({
      externalId: "1234",
      personal,
      conflictPolicy: "reject-existing",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.personal).toMatchObject({
        status: "playing",
        hoursPlayed: 12,
        timesFinished: 1,
        rating: 9,
        favorite: true,
        fullyCompleted: false,
        achievements: true,
        achievementProgress: 80,
      });
      // Reviews travel exclusively through the Minha review section
      // (`{ content }`), never through the legacy form field.
      expect(parsed.data.personal).not.toHaveProperty("review");
    }
  });

  it("omits empty personal fields like the manual flow", () => {
    const { game: _game, ...personal } = formToPayload({
      ...EMPTY_GAME_FORM,
      name: "Chrono Trigger",
    });
    expect(personal).not.toHaveProperty("rating");
    expect(personal).not.toHaveProperty("review");
    // achievements:false yields an explicit null progress (clear signal),
    // which both schemas accept.
    expect(personal).toHaveProperty("achievementProgress", null);
    expect(
      searchImportSchema.safeParse({ externalId: "1234", personal }).success,
    ).toBe(true);
  });
});

describe("edit-and-add wiring patterns", () => {
  it("menu offers the action without touching existing items", () => {
    const p = "features/atp/catalog-context-menu.tsx";
    expect(
      hasPattern(p, [
        "onEditAndAdd",
        '"Editar jogo e adicionar"',
        '"Ver detalhes"',
        '"Adicionar ao Backlog"',
        '"Remover do Backlog"',
      ]),
    ).toBe(true);
  });

  it("catalog search wires the action in grid and list", () => {
    const p = "features/atp/catalog-search.tsx";
    expect(
      hasPattern(p, [
        "handleEditAndAdd",
        "onEditAndAdd={() => void handleEditAndAdd(item)}",
        "/backlog/new?externalId=",
        "searchDetailEndpoint(card.atpId)",
      ]),
    ).toBe(true);
  });

  it("new page accepts externalId alongside collectionId", () => {
    const p = "app/(app)/backlog/new/page.tsx";
    expect(
      hasPattern(p, ["externalId", "collectionId", "initialExternalId"]),
    ).toBe(true);
  });

  it("container loads IGDB detail and submits through the import", () => {
    const p = "features/games/game-form-container.tsx";
    expect(
      hasPattern(p, [
        "initialExternalId",
        "igdbDetailEndpoint",
        "atpDetailToFormPatch",
        "/api/search/import",
        'conflictPolicy: "reject-existing"',
        "metadataLocked",
      ]),
    ).toBe(true);
  });

  it("form locks metadata but keeps personal fields editable", () => {
    const p = "features/games/game-form.tsx";
    expect(
      hasPattern(p, [
        "metadataLocked",
        "Dados do catálogo — somente leitura.",
        "disabled={metadataLocked}",
      ]),
    ).toBe(true);
    const content = readFileSync(p, "utf8");
    // Personal section ("Dados do Jogador") stays enabled: the locked
    // notice renders once, before the metadata heading, and no
    // metadataLocked gate exists past the metadata fields.
    const lockNotice = content.indexOf("somente leitura");
    const playerSection = content.indexOf("Dados do Jogador");
    expect(lockNotice > 0 && playerSection > lockNotice).toBe(true);
    const afterPlayer = content.slice(playerSection);
    expect(afterPlayer).not.toContain("metadataLocked");
  });

  it("replaces the legacy review textarea with the Minha review section", () => {
    const form = "features/games/game-form.tsx";
    const section = "features/reviews/review-form-section.tsx";
    const formContent = readFileSync(form, "utf8");
    const sectionContent = readFileSync(section, "utf8");
    expect(formContent).toContain("ReviewFormSection");
    expect(sectionContent).toContain("Minha review");
    // The old free-text review field (and its placeholder) is gone;
    // reviews travel exclusively through the section + draft flow.
    expect(formContent).not.toContain("Suas experiências pessoais com o jogo");
    expect(formContent).not.toContain("form.review");
  });
});
