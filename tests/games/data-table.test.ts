/**
 * List-mode Data Table RPGUI: structural contract tests (no DOM).
 *
 * The repo's vitest setup cannot transform `.tsx` value imports
 * (`jsx: preserve` + vite import-analysis), so UI behavior is pinned
 * through file-content contracts (repo convention, e.g. loading-ux)
 * plus pure unit coverage where logic was extracted.
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function hasPatterns(path: string, patterns: string[]): boolean {
  const content = readFileSync(path, "utf8");
  return patterns.every((pattern) => content.includes(pattern));
}

describe("shared DataTable structure", () => {
  const p = "features/games/data-table.tsx";

  it("uses table semantics with RPGUI framed rows", () => {
    expect(
      hasPatterns(p, [
        'role="table"',
        'role="row"',
        'role="columnheader"',
        'role="cell"',
        "rpgui-container framed-grey",
        "rpgui-container framed-golden",
        "overflow-x-auto",
      ]),
    ).toBe(true);
  });

  it("keeps rows keyboard-operable with guarded activation", () => {
    expect(
      hasPatterns(p, [
        "tabIndex",
        "onKeyDown",
        'closest("button,a,input,select,textarea")',
        "focus-visible:outline-2",
      ]),
    ).toBe(true);
  });

  it("keeps row actions independent from the row click", () => {
    for (const row of [
      "features/atp/catalog-table-row.tsx",
      "features/games/backlog-table-row.tsx",
    ]) {
      expect(hasPatterns(row, ["event.stopPropagation()"])).toBe(true);
    }
  });
});

describe("Collection list-mode upgrade", () => {
  const p = "features/games/collection.tsx";

  it("adds an opt-in table branch without touching grid or legacy list", () => {
    expect(
      hasPatterns(p, [
        "renderListTable?",
        "header: ReactNode",
        "renderRow: (item: T) => ReactNode",
        "viewMode === \"grid\"",
        "renderListItem(item)",
      ]),
    ).toBe(true);
  });

  it("keeps viewMode, pagination and toolbar contracts", () => {
    expect(
      hasPatterns(p, [
        "ViewModeToggle",
        "CollectionPagination",
        "onViewModeChange",
        "onPageChange",
        "onItemsPerPageChange",
      ]),
    ).toBe(true);
  });
});

describe("catalog table columns", () => {
  const p = "features/atp/catalog-table-row.tsx";

  it("renders Jogo + Lançamento + Plataformas + Gêneros + Ação", () => {
    expect(
      hasPatterns(p, [
        "Jogo",
        "Lançamento",
        "Plataformas",
        "Gêneros",
        "Ação",
        "card.platforms",
        "card.genres",
        "card.year",
        "Adicionar",
      ]),
    ).toBe(true);
  });

  it("shares one grid template between header and rows, responsive", () => {
    expect(
      hasPatterns(p, [
        "CATALOG_TABLE_GRID",
        "CATALOG_TABLE_MIN_WIDTH",
        "hidden md:block",
      ]),
    ).toBe(true);
  });

  it("documents the developer-column constraint (no card-level data)", () => {
    // AtpSearchCard carries no developers/publishers (preview-only);
    // the row must not invent the column.
    const card = readFileSync("features/atp/atp-result.ts", "utf8");
    const cardBlock = card.slice(
      card.indexOf("export interface AtpSearchCard"),
      card.indexOf("export interface AtpSearchPagination"),
    );
    expect(cardBlock).not.toContain("developers");
    expect(hasPatterns(p, ["developer"])).toBe(false);
  });

  it("reuses the single lazy-cover hook (no duplicated fetching)", () => {
    expect(
      hasPatterns("features/atp/catalog-search.tsx", [
        'import { useAtpCover } from "./use-atp-cover"',
      ]),
    ).toBe(true);
    expect(
      hasPatterns("features/atp/use-atp-cover.ts", ["searchCoverEndpoint"]),
    ).toBe(true);
  });

  it("preserves grid cards and list actions", () => {
    expect(
      hasPatterns("features/atp/catalog-search.tsx", [
        "CatalogGridCard",
        "renderGridItem",
        "renderListItem",
        "renderListTable",
        "onToggleBacklog",
        "onEditAndAdd",
      ]),
    ).toBe(true);
  });
});

describe("backlog table columns", () => {
  const p = "features/games/backlog-table-row.tsx";

  it("renders Jogo + Plataforma + Status + Horas + Nota + Favorito + Ações", () => {
    expect(
      hasPatterns(p, [
        "Plataforma",
        "Status",
        "Horas",
        "Nota",
        "Favorito",
        "Ações",
        "getStatusLabel",
        "hoursPlayed",
        "game.rating",
        "game.favorite",
        "Detalhes",
      ]),
    ).toBe(true);
  });

  it("shares one grid template between header and rows, tabular on mobile", () => {
    const content = readFileSync(p, "utf8");
    expect(content).toContain("BACKLOG_TABLE_GRID");
    expect(content).toContain("BACKLOG_TABLE_MIN_WIDTH");
    // Mobile keeps columns (reduced set), never converts rows to cards.
    expect(content).not.toContain("framed-golden grid grid-cols-[1fr_auto]");
  });

  it("keeps backlog wiring: menu, modal, edit and delete flows", () => {
    expect(
      hasPatterns("features/games/backlog-view.tsx", [
        "GameContextMenu",
        "BacklogTableRow",
        "BacklogTableHeader",
        "renderListTable",
        "GameModal",
        "ConfirmDialog",
        "setDeleteTarget",
        "renderListItem",
        "GameCollectionItem",
      ]),
    ).toBe(true);
  });
});
