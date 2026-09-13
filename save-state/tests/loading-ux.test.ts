import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function hasLoadingPattern(path: string, patterns: string[]): boolean {
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

describe("loading UX", () => {
  it("GameModal prevents duplicate Zerei+1 and Favorite", () => {
    const p = "features/games/game-modal.tsx";
    expect(hasLoadingPattern(p, ["isFinishing", "isTogglingFavorite", "disabled={isFinishing", "aria-busy"])).toBe(true);
  });
  it("Backlog delete is guarded", () => {
    const p = "features/games/backlog-view.tsx";
    expect(hasLoadingPattern(p, ["isDeleting", "isLoading={isDeleting", "finally"])).toBe(true);
  });
  it("Catalog search handles race with requestId", () => {
    const p = "features/atp/catalog-search.tsx";
    expect(hasLoadingPattern(p, ["requestIdRef", "requestId !== requestIdRef.current", "isPreviewLoading"])).toBe(true);
  });
  it("Collection shows framed loading", () => {
    const p = "features/games/collection.tsx";
    expect(hasLoadingPattern(p, ["[ Carregando... ]", "framed-grey"])).toBe(true);
  });
  it("Export buttons show loading and block duplicates", () => {
    const p = "features/settings/export-buttons.tsx";
    expect(hasLoadingPattern(p, ["isJsonLoading", "isCsvLoading", "disabled={isJsonLoading", "finally"])).toBe(true);
  });
  it("Lists manager handles rename/delete loading", () => {
    const p = "features/lists/lists-manager.tsx";
    expect(hasLoadingPattern(p, ["isRenaming", "isDeleting", "disabled={isRenaming"])).toBe(true);
  });
});
