/**
 * Shared semantic data table — structural contracts.
 *
 * Real `<table>` semantics replace the former div/grid impersonation.
 * Source contracts pin the structure that the jsdom tests then exercise
 * through the rendered DOM (`backlog-table-row.test.tsx`).
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function hasPatterns(path: string, patterns: string[]): boolean {
  const content = readFileSync(path, "utf8");
  return patterns.every((pattern) => content.includes(pattern));
}

function contentOf(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/** Strips comments so prose mentions of forbidden patterns do not count. */
function codeOf(path: string): string {
  return contentOf(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("shared DataTable structure", () => {
  const p = "features/games/data-table.tsx";

  it("renders native table elements", () => {
    expect(
      hasPatterns(p, [
        "<table",
        "<thead>",
        "<tbody>",
        "<tr",
        "<th",
        "scope=\"col\"",
        "<td",
        "overflow-x-auto",
      ]),
    ).toBe(true);
  });

  it("does not impersonate table semantics with ARIA roles", () => {
    const content = codeOf(p);
    expect(content).not.toContain('role="table"');
    expect(content).not.toContain('role="row"');
    expect(content).not.toContain('role="cell"');
    expect(content).not.toContain('role="columnheader"');
  });

  it("does not use CSS grid or flex for the table structure", () => {
    const content = contentOf(p);
    expect(content).not.toContain("grid-cols");
    expect(content).not.toContain("display: flex");
    expect(content).not.toContain("display: grid");
  });

  it("keeps rows keyboard-operable with guarded activation", () => {
    expect(
      hasPatterns(p, [
        "tabIndex",
        "onKeyDown",
        'closest("button,a,input,select,textarea")',
      ]),
    ).toBe(true);
    // Visible focus is styled on the cell, not the row, because table
    // rows do not paint outlines reliably across browsers.
    expect(
      hasPatterns("app/globals.css", [
        ".rpgui-data-table tbody tr:focus-visible td",
      ]),
    ).toBe(true);
  });

  it("keeps row actions independent from the row click", () => {
    // The catalog keeps a real import action inside the row; it must not
    // trigger the details modal. The backlog row has no action column.
    expect(
      hasPatterns("features/atp/catalog-table-row.tsx", [
        "event.stopPropagation()",
      ]),
    ).toBe(true);
  });
});

describe("context menu adaptation", () => {
  it("attaches the menu to the row instead of wrapping it in a div", () => {
    expect(
      hasPatterns("features/games/context-menu.tsx", [
        "asChild",
        "cloneElement",
        "onContextMenu",
      ]),
    ).toBe(true);
    expect(
      hasPatterns("features/games/backlog-view.tsx", ["asChild"]),
    ).toBe(true);
    // Only the table usage opts into asChild; grid/list keep the wrapper.
    const catalog = contentOf("features/atp/catalog-search.tsx");
    expect(catalog.match(/asChild/g)).toHaveLength(1);
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

  it("uses the shared semantic table with responsive columns", () => {
    expect(
      hasPatterns(p, [
        "DataTableHeader",
        "DataTableHeaderCell",
        "DataTableCell",
        "CATALOG_TABLE_MIN_WIDTH",
        "colgroup",
        "hidden md:table-cell",
      ]),
    ).toBe(true);
    expect(contentOf(p)).not.toContain("CATALOG_TABLE_GRID");
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
  const content = contentOf(p);

  it("renders Jogo + Plataforma + Status + Horas + Nota + Favorito", () => {
    expect(
      hasPatterns(p, [
        "Plataforma",
        "Status",
        "Horas",
        "Nota",
        "Favorito",
        "getStatusLabel",
        "hoursPlayed",
        "game.rating",
        "game.favorite",
      ]),
    ).toBe(true);
  });

  it("removes the redundant Ações/Detalhes column globally", () => {
    // Backlog and collection screens share this row; neither renders an
    // action column or a "Detalhes" button anymore.
    expect(content).not.toContain(">Ações<");
    expect(content).not.toContain('title="Detalhes"');
    expect(content).not.toContain("<RPGUIButton");
    // The row itself still opens the details modal.
    expect(content).toContain("onActivate={onDetails}");
    expect(content).toContain("onDetails: () => void");
  });

  it("uses the shared semantic table with responsive columns", () => {
    expect(content).toContain("BACKLOG_TABLE_MIN_WIDTH");
    expect(content).toContain("colgroup");
    expect(content).toContain("hidden md:table-cell");
    expect(content).not.toContain("BACKLOG_TABLE_GRID");
    expect(content).not.toContain("grid-cols-");
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
