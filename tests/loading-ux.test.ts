import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function hasLoadingPattern(path: string, patterns: string[]): boolean {
  const content = readFileSync(path, "utf8");
  return patterns.every((p) => content.includes(p));
}

describe("loading UX", () => {
  it("GameModal prevents duplicate Zerei+1 and Favorite", () => {
    // Phase 4: the Zerei+1/Favorite guards moved with the refactor from
    // game-modal.tsx into user-game-drawer-content.tsx (same patterns).
    const p = "features/games/user-game-drawer-content.tsx";
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
    const p = "features/collections/collections-manager.tsx";
    expect(hasLoadingPattern(p, ["isRenaming", "isDeleting", "disabled={isRenaming"])).toBe(true);
  });
});

describe("LoadingScreen helpers (components/RPGUI/loading-progress.ts)", () => {
  // Pure helpers are imported directly (node env, no DOM needed) — the
  // same pattern as other `.ts` imports in this suite.
  it("exposes the default RPGUI message", async () => {
    const { LOADING_SCREEN_DEFAULT_MESSAGE } = await import(
      "@/components/RPGUI/loading-progress"
    );
    expect(LOADING_SCREEN_DEFAULT_MESSAGE).toBe("Loading... Please wait");
  });

  it("clamps controlled progress into [0, max]", async () => {
    const { clampLoadingValue, LOADING_SCREEN_MAX } = await import(
      "@/components/RPGUI/loading-progress"
    );
    expect(clampLoadingValue(42)).toBe(42);
    expect(clampLoadingValue(-5)).toBe(0);
    expect(clampLoadingValue(150)).toBe(LOADING_SCREEN_MAX);
    expect(clampLoadingValue(Number.NaN)).toBe(0);
    expect(clampLoadingValue(10, 0)).toBe(0);
    expect(clampLoadingValue(7, 10)).toBe(7);
    expect(clampLoadingValue(12, 10)).toBe(10);
  });

  it("simulates decelerating progress that never completes", async () => {
    const { indeterminateProgressAt, LOADING_SCREEN_MAX } = await import(
      "@/components/RPGUI/loading-progress"
    );
    const at0 = indeterminateProgressAt(0);
    expect(at0).toBeCloseTo(8, 6);
    let prev = at0;
    for (const t of [500, 1000, 2000, 4000, 8000, 30000, 120000]) {
      const cur = indeterminateProgressAt(t);
      // Monotonic: the bar never jumps backwards.
      expect(cur).toBeGreaterThan(prev);
      // Never reaches 100%: unmount (navigation finished) is the
      // only way the bar disappears.
      expect(cur).toBeLessThan(LOADING_SCREEN_MAX);
      prev = cur;
    }
    // Decelerates: equal time spans gain less as time passes.
    const early = indeterminateProgressAt(1000) - indeterminateProgressAt(0);
    const late = indeterminateProgressAt(31000) - indeterminateProgressAt(30000);
    expect(early).toBeGreaterThan(late);
    // Asymptote approaches the 90% cap from below.
    expect(indeterminateProgressAt(120000)).toBeLessThan(90);
    expect(indeterminateProgressAt(120000)).toBeGreaterThan(89);
  });

  it("clamps negative elapsed time to the start value", async () => {
    const { indeterminateProgressAt } = await import(
      "@/components/RPGUI/loading-progress"
    );
    expect(indeterminateProgressAt(-1000)).toBe(indeterminateProgressAt(0));
  });

  it("reduced-motion fallback is a static mid value (no animation)", async () => {
    const { REDUCED_MOTION_STATIC_VALUE, LOADING_SCREEN_MAX } = await import(
      "@/components/RPGUI/loading-progress"
    );
    expect(REDUCED_MOTION_STATIC_VALUE).toBeGreaterThan(0);
    expect(REDUCED_MOTION_STATIC_VALUE).toBeLessThan(LOADING_SCREEN_MAX);
  });

  it("prefersReducedMotion is false without a browser", async () => {
    const { prefersReducedMotion } = await import(
      "@/components/RPGUI/loading-progress"
    );
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("LoadingScreen integration", () => {
  it("all route boundaries render the shared LoadingScreen", () => {
    // Shared fallback plus the two specific boundaries. Specific
    // segments (dashboard, backlog) keep their own loading.tsx with
    // contextual messages; every other authenticated route falls back
    // to app/(app)/loading.tsx.
    for (const p of [
      "app/(app)/loading.tsx",
      "app/(app)/dashboard/loading.tsx",
      "app/(app)/backlog/loading.tsx",
    ]) {
      const content = readFileSync(p, "utf8");
      expect(content).toContain("LoadingScreen");
      expect(content).not.toContain("setInterval");
    }
    // The shared fallback renders the default (indeterminate) mode.
    expect(readFileSync("app/(app)/loading.tsx", "utf8")).toContain(
      "<LoadingScreen />",
    );
  });

  it("indeterminate mode animates with rAF, cleans up, respects reduced motion", () => {
    const component = readFileSync(
      "components/RPGUI/LoadingScreen.tsx",
      "utf8",
    );
    expect(component).toContain("requestAnimationFrame");
    expect(component).toContain("cancelAnimationFrame");
    expect(component).toContain('role="status"');
    expect(component).toContain("aria-live");
    expect(component).toContain("indeterminate");
    // The reduced-motion contract lives with the helpers.
    const helpers = readFileSync(
      "components/RPGUI/loading-progress.ts",
      "utf8",
    );
    expect(helpers).toContain("prefers-reduced-motion");
    expect(helpers).toContain("REDUCED_MOTION_STATIC_VALUE");
    // No fake percentages, no interval timers, no dependence on a
    // loading.tsx-provided `isLoading=false` event. Progress is never
    // formatted into text (no numeric labels at all).
    expect(component).not.toContain("setInterval");
    expect(component).not.toContain("toFixed");
    expect(component).not.toContain("Math.round");
  });

  it("ProgressBar supports indeterminate semantics", () => {
    const content = readFileSync("components/RPGUI/ProgressBar.tsx", "utf8");
    expect(content).toContain("indeterminate");
    expect(content).toContain("aria-valuenow");
  });

  it("global overlay reuses LoadingScreen without changing its contract", () => {
    const content = readFileSync(
      "features/navigation/loading-overlay.tsx",
      "utf8",
    );
    expect(content).toContain("LoadingScreen");
    expect(content).toContain("useUiStore");
    expect(content).toContain("if (!isLoading)");
    expect(content).toContain("z-[9999]");
  });
});
