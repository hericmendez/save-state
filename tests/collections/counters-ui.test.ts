/**
 * Collection counters — UI wiring and signal emission patterns
 * (node environment: source-pattern assertions, repo convention).
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function contentOf(path: string): string {
  // O checkout Windows grava CRLF no working tree (o repo guarda LF);
  // as asserções abaixo verificam adjacência de statements, não bytes de
  // quebra de linha — normalizar preserva a força da asserção.
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function occurrences(content: string, pattern: string): number {
  return content.split(pattern).length - 1;
}

describe("sidebar counter rendering", () => {
  const p = "features/navigation/collection-nav-items.tsx";
  const content = contentOf(p);

  it("fetches with withCount=true keeping limit 100", () => {
    expect(content).toContain("/api/game-collections?limit=100&withCount=true");
  });

  it("renders the count as an independent shrink-0 element", () => {
    expect(content).toContain("[{collection.gameCount}]");
    expect(content).toContain("shrink-0");
  });

  it("keeps the name truncating independently", () => {
    expect(content).toContain("min-w-0 flex-1 truncate");
  });
});

describe("collection page total", () => {
  it("passes the unfiltered total to BacklogView", () => {
    const page = contentOf(
      "app/(app)/backlog/lists/[listId]/page.tsx",
    );
    expect(page).toContain("withCount: true");
    expect(page).toContain("totalGames");
    expect(page).toContain("?.gameCount ?? 0");
  });

  it("shows singular/plural only on collection views", () => {
    const view = contentOf("features/games/backlog-view.tsx");
    expect(view).toContain("collectionId !== undefined");
    expect(view).toContain('totalGames === 1 ? "1 jogo"');
    expect(view).toContain("jogos");
  });

  it("leaves pagination semantics untouched", () => {
    const view = contentOf("features/games/backlog-view.tsx");
    expect(view).toContain("pagination={pagination}");
  });
});

describe("signal emission on membership changes", () => {
  it("menu notifies on add and remove only after success", () => {
    const menu = contentOf("features/games/game-context-menu.tsx");
    expect(occurrences(menu, "notifyCollectionsChanged()")).toBe(2);
    // Emits sit on the success path, before the local refresh callback.
    expect(menu).toContain(
      "notifyCollectionsChanged();\n      onCollectionChanged?.();",
    );
    // Failure paths restore local state and report — never notify.
    const catches = menu.split("} catch (err) {").slice(1);
    expect(catches.length).toBeGreaterThan(0);
    for (const block of catches) {
      expect(block.slice(0, 300)).not.toContain("notifyCollectionsChanged");
    }
  });

  it("form notifies after attach in both create branches", () => {
    const form = contentOf("features/games/game-form-container.tsx");
    expect(occurrences(form, "notifyCollectionsChanged()")).toBe(2);
  });

  it("backlog delete notifies once on success", () => {
    const view = contentOf("features/games/backlog-view.tsx");
    expect(occurrences(view, "notifyCollectionsChanged()")).toBe(1);
  });

  it("catalog toggle notifies only on removal", () => {
    const catalog = contentOf("features/atp/catalog-search.tsx");
    expect(occurrences(catalog, "notifyCollectionsChanged()")).toBe(1);
    const toggle = catalog.slice(
      catalog.indexOf("async function handleToggleBacklog"),
    );
    // Notify lives in the owned (DELETE) branch, before the add branch.
    const notifyAt = toggle.indexOf("notifyCollectionsChanged()");
    const addBranchAt = toggle.indexOf("searchImportEndpoint");
    expect(notifyAt).toBeGreaterThan(-1);
    expect(addBranchAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeLessThan(addBranchAt);
  });

  it("manual creation flow is preserved", () => {
    const form = contentOf("features/games/game-form-container.tsx");
    expect(form).toContain('apiRequest<Game>("/api/games"');
    expect(form).toContain("EMPTY_GAME_FORM");
  });
});
