/**
 * Layout-mode preference: parsing, first-paint resolution, and the
 * no-flash wiring (pre-paint CSSOM + hydration-stable root markup).
 * No DOM test infrastructure in the repo — logic is unit-tested with
 * stubbed globals, wiring is asserted at source level.
 */

import { readFileSync } from "fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPreferenceStyles,
  DEFAULT_FONT_BODY,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_GRID_DENSITY,
  DEFAULT_LAYOUT_MODE,
  GRID_DENSITIES,
  isNarrowViewport,
  LAYOUT_INIT_SCRIPT,
  LAYOUT_STORAGE_KEY,
  parseFontBody,
  parseFontDisplay,
  parseGridDensity,
  parseLayoutMode,
  resolveInitialGridDensity,
  readStoredLayoutMode,
  PREFERENCE_STYLESHEET_ID,
  readUiPreferenceSnapshot,
  resolveUiPreferences,
  resolveInitialFontBody,
  resolveInitialFontDisplay,
  resolveInitialLayoutMode,
} from "@/features/shared/layout-mode";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPreferenceStylesheet() {
  const cssRules: Array<{
    selectorText: string;
    cssText: string;
    style: {
      getPropertyValue: (property: string) => string;
      setProperty: (property: string, value: string) => void;
    };
  }> = [];
  const sheet = {
    cssRules,
    deleteRule(index: number) {
      cssRules.splice(index, 1);
    },
    insertRule(cssText: string, index: number) {
      const declarations = new Map<string, string>();
      const rule = {
        selectorText: cssText.slice(0, cssText.indexOf("{")).trim(),
        cssText,
        style: {
          getPropertyValue: (property: string) => declarations.get(property) ?? "",
          setProperty: (property: string, value: string) => {
            declarations.set(property, value);
          },
        },
      };
      cssRules.splice(index, 0, rule);
      return index;
    },
  };
  vi.stubGlobal("document", {
    getElementById: (id: string) =>
      id === PREFERENCE_STYLESHEET_ID ? { sheet } : null,
  });
  return sheet;
}

function stubBrowser(options: {
  innerWidth: number;
  stored: string | null | "throw" | "garbage";
}) {
  const getItem = () => {
    if (options.stored === "throw") throw new Error("denied");
    if (options.stored === "garbage") return "{not json";
    return options.stored;
  };
  vi.stubGlobal("window", {
    innerWidth: options.innerWidth,
    localStorage: { getItem },
    matchMedia: undefined,
  });
}

describe("parseLayoutMode", () => {
  it("accepts the two stored values", () => {
    expect(parseLayoutMode("fullscreen")).toBe("fullscreen");
    expect(parseLayoutMode("pixel-perfect")).toBe("pixel-perfect");
  });

  it("rejects everything else", () => {
    for (const value of [null, undefined, "", "FULLSCREEN", "pixel", 0, {}]) {
      expect(parseLayoutMode(value)).toBeNull();
    }
  });
});

describe("resolveInitialLayoutMode", () => {
  it("defaults to fullscreen with no browser globals (SSR)", () => {
    expect(DEFAULT_LAYOUT_MODE).toBe("fullscreen");
    expect(resolveInitialLayoutMode()).toBe("fullscreen");
  });

  it("uses fullscreen on first access without a saved preference", () => {
    stubBrowser({ innerWidth: 1280, stored: null });
    expect(readStoredLayoutMode()).toBeNull();
    expect(resolveInitialLayoutMode()).toBe("fullscreen");
  });

  it("applies a saved fullscreen immediately", () => {
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({ state: { layoutMode: "fullscreen" } }),
    });
    expect(resolveInitialLayoutMode()).toBe("fullscreen");
  });

  it("applies a saved pixel-perfect immediately", () => {
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({ state: { layoutMode: "pixel-perfect" } }),
    });
    expect(resolveInitialLayoutMode()).toBe("pixel-perfect");
  });

  it("forces fullscreen on narrow viewports regardless of storage", () => {
    stubBrowser({
      innerWidth: 500,
      stored: JSON.stringify({ state: { layoutMode: "pixel-perfect" } }),
    });
    expect(isNarrowViewport()).toBe(true);
    expect(resolveInitialLayoutMode()).toBe("fullscreen");
  });

  it("falls back to fullscreen on invalid or unavailable storage", () => {
    stubBrowser({ innerWidth: 1280, stored: "garbage" });
    expect(resolveInitialLayoutMode()).toBe("fullscreen");
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({ state: { layoutMode: "ultrawide" } }),
    });
    expect(resolveInitialLayoutMode()).toBe("fullscreen");
    stubBrowser({ innerWidth: 1280, stored: "throw" });
    expect(resolveInitialLayoutMode()).toBe("fullscreen");
  });

  it("preserves the six-column default and accepts only 6, 8, 10, or 12", () => {
    expect(DEFAULT_GRID_DENSITY).toBe(6);
    expect(GRID_DENSITIES).toEqual([6, 8, 10, 12]);
    for (const value of GRID_DENSITIES) expect(parseGridDensity(value)).toBe(value);
    for (const value of ["6", 4, 14, null, undefined]) {
      expect(parseGridDensity(value)).toBeNull();
    }
  });

  it("restores a valid saved grid density and defaults for invalid storage", () => {
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({ state: { gridDensity: 10 } }),
    });
    expect(resolveInitialGridDensity()).toBe(10);
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({ state: { gridDensity: 7 } }),
    });
    expect(resolveInitialGridDensity()).toBe(6);
  });
});

describe("resolveUiPreferences", () => {
  it("preserves valid preferences and forces fullscreen below 768px", () => {
    const stored = JSON.stringify({
      state: {
        layoutMode: "pixel-perfect",
        fontDisplay: "roboto",
        fontBody: "jetbrains-mono",
        gridDensity: 12,
      },
    });
    expect(resolveUiPreferences(stored, 1366)).toEqual({
      layoutMode: "pixel-perfect",
      fontDisplay: "roboto",
      fontDisplayExplicit: true,
      fontBody: "jetbrains-mono",
      gridDensity: 12,
    });
    expect(resolveUiPreferences(stored, 390).layoutMode).toBe("fullscreen");
  });

  it("uses defaults for missing, invalid, corrupt, and unavailable storage", () => {
    expect(resolveUiPreferences(null, 1366)).toMatchObject({
      layoutMode: "fullscreen",
      fontDisplay: "press-start-2p",
      fontDisplayExplicit: false,
      fontBody: "jetbrains-mono",
      gridDensity: 6,
    });
    expect(resolveUiPreferences("{invalid", 1366).fontDisplayExplicit).toBe(false);
    expect(
      resolveUiPreferences(
        JSON.stringify({
          state: {
            layoutMode: "bad",
            fontDisplay: "comic-sans",
            fontBody: "bad",
            gridDensity: 7,
          },
        }),
        1366,
      ),
    ).toMatchObject({
      layoutMode: "fullscreen",
      fontDisplay: "press-start-2p",
      fontDisplayExplicit: false,
      fontBody: "jetbrains-mono",
      gridDensity: 6,
    });
  });
});

describe("applyPreferenceStyles", () => {
  it("does not mutate root attributes and installs selected rules into CSSOM", () => {
    const sheet = stubPreferenceStylesheet();
    expect(
      applyPreferenceStyles(
        {
          layoutMode: "pixel-perfect",
          fontDisplay: "roboto",
          fontDisplayExplicit: true,
          fontBody: "roboto",
          gridDensity: 12,
        },
        PREFERENCE_STYLESHEET_ID,
      ),
    ).toBe(true);
    expect(sheet.cssRules[0].selectorText).toBe(":root");
    expect(sheet.cssRules[0].style.getPropertyValue("--ss-pref-layout-zoom"))
      .toBe("80%");
    expect(sheet.cssRules[0].style.getPropertyValue("--ss-pref-grid-columns-1476"))
      .toBe("12");
    expect(sheet.cssRules[0].style.getPropertyValue("--font-display-name"))
      .toContain("var(--font-roboto)");
    expect(sheet.cssRules[0].style.getPropertyValue("--font-body-name"))
      .toContain("var(--font-roboto)");
    expect(sheet.cssRules.some((rule) => rule.selectorText.includes(".rpgui-button")))
      .toBe(true);

    const fontCases = [
      {
        fontDisplay: "press-start-2p",
        fontDisplayExplicit: false,
        fontBody: "jetbrains-mono",
        expectedDisplay: "var(--font-display), system-ui",
        expectedMobileOverride: "",
        expectedRuleCount: 2,
      },
      {
        fontDisplay: "jetbrains-mono",
        fontDisplayExplicit: true,
        fontBody: "roboto",
        expectedDisplay: "var(--font-body)",
        expectedMobileOverride: "var(--font-display-name, var(--font-display))",
        expectedRuleCount: 1,
      },
      {
        fontDisplay: "roboto",
        fontDisplayExplicit: true,
        fontBody: "jetbrains-mono",
        expectedDisplay: "var(--font-roboto), system-ui, sans-serif",
        expectedMobileOverride: "var(--font-display-name, var(--font-display))",
        expectedRuleCount: 3,
      },
    ] as const;
    for (const fontCase of fontCases) {
      applyPreferenceStyles(
        {
          layoutMode: "fullscreen",
          gridDensity: 6,
          ...fontCase,
        },
        PREFERENCE_STYLESHEET_ID,
      );
      expect(sheet.cssRules[0].style.getPropertyValue("--font-display-name"))
        .toBe(fontCase.expectedDisplay);
      expect(
        sheet.cssRules[0].style.getPropertyValue("--ss-mobile-font-functional"),
      ).toBe(fontCase.expectedMobileOverride);
      expect(sheet.cssRules.length).toBe(fontCase.expectedRuleCount);
    }
  });

  it("replaces the current CSSOM rule set on preference changes", () => {
    const sheet = stubPreferenceStylesheet();
    const preferences = resolveUiPreferences(null, 1366);
    applyPreferenceStyles(preferences, PREFERENCE_STYLESHEET_ID);
    expect(sheet.cssRules.length).toBe(2);
    applyPreferenceStyles(
      { ...preferences, fontDisplay: "jetbrains-mono", gridDensity: 8 },
      PREFERENCE_STYLESHEET_ID,
    );
    expect(sheet.cssRules.length).toBe(1);
    expect(sheet.cssRules[0].style.getPropertyValue("--ss-pref-grid-columns-856"))
      .toBe("7");

    const densities = {
      6: [6, 6, 6, 6, 6, 6],
      8: [7, 8, 8, 8, 8, 8],
      10: [7, 8, 9, 10, 10, 10],
      12: [7, 8, 9, 10, 11, 12],
    } as const;
    const breakpoints = [856, 980, 1104, 1228, 1352, 1476];
    for (const density of GRID_DENSITIES) {
      applyPreferenceStyles(
        { ...preferences, fontDisplay: "jetbrains-mono", gridDensity: density },
        PREFERENCE_STYLESHEET_ID,
      );
      const root = sheet.cssRules[0].style;
      expect(
        breakpoints.map((breakpoint) =>
          Number(root.getPropertyValue(`--ss-pref-grid-columns-${breakpoint}`)),
        ),
      ).toEqual(densities[density]);
    }
  });

  it("returns false if the server-rendered preference sheet is unavailable", () => {
    vi.stubGlobal("document", { getElementById: () => null });
    expect(
      applyPreferenceStyles(resolveUiPreferences(null, 1366), PREFERENCE_STYLESHEET_ID),
    ).toBe(false);
  });

  it("is a safe no-op when no DOM exists", () => {
    vi.stubGlobal("document", undefined);
    expect(
      applyPreferenceStyles(resolveUiPreferences(null, 1366), PREFERENCE_STYLESHEET_ID),
    ).toBe(false);
  });
});

describe("no-flash wiring (source level)", () => {
  it("shares the storage key with the persist middleware", () => {
    expect(LAYOUT_STORAGE_KEY).toBe("save-state-ui");
    const store = readFileSync("features/shared/ui-store.ts", "utf8");
    expect(store).toContain("LAYOUT_STORAGE_KEY");
    expect(store).toContain("resolveInitialLayoutMode");
    // Even a late persist rehydration re-derives the same value.
    expect(store).toContain("merge:");
    // No hardcoded pixel-perfect first paint remains in the initial state.
    expect(store).not.toContain("layoutMode: isMobileDevice()");
  });

  it("inlines a parser-blocking CSSOM bootstrap without root preference attributes", () => {
    expect(LAYOUT_INIT_SCRIPT).toContain("save-state-ui");
    expect(LAYOUT_INIT_SCRIPT).toContain("insertRule");
    expect(LAYOUT_INIT_SCRIPT).toContain("save-state-preference-styles");
    expect(LAYOUT_INIT_SCRIPT).not.toContain("setAttribute");
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("LAYOUT_INIT_SCRIPT");
    expect(layout).toContain("PREFERENCE_STYLESHEET_ID");
    expect(layout).toContain("<head>");
    expect(layout.indexOf("PREFERENCE_STYLESHEET_ID"))
      .toBeLessThan(layout.indexOf("dangerouslySetInnerHTML"));
  });

  it("uses container width and the root preference to size the shared game grid", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("container: game-grid / inline-size");
    expect(css).toContain(".game-card-grid");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("--ss-pref-grid-columns-1476");
    expect(css).not.toContain("data-grid-density");
    for (const threshold of [360, 484, 608, 732, 856, 980, 1104, 1228, 1352, 1476]) {
      expect(css).toContain(`@container game-grid (min-width: ${threshold}px)`);
    }
    const collection = readFileSync("features/games/collection.tsx", "utf8");
    expect(collection).toContain("game-grid-container");
    expect(collection).toContain("GridDensitySelect");
    expect(collection).toContain('viewMode === "grid"');
  });

  it("drives frame geometry from preference CSS variables in CSS", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("--ss-pref-layout-max-width");
    expect(css).toContain("--ss-pref-layout-zoom");
    expect(css).not.toContain("data-layout-mode");
    for (const marker of [
      ".layout-shell",
      ".layout-shell-inner",
      ".layout-frame",
      ".layout-zoom",
    ]) {
      expect(css).toContain(marker);
    }
  });

  it("renders mode-neutral markup (no hydration divergence)", () => {
    for (const file of [
      "features/navigation/app-shell.tsx",
      "features/navigation/content.tsx",
      "features/navigation/nav-desktop.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("isFullscreen");
      expect(source).not.toContain("pixel-frame-height");
    }
    const content = readFileSync("features/navigation/content.tsx", "utf8");
    expect(content).not.toContain("useUiStore");
  });
});

describe("font preferences — parsing and resolution", () => {
  it("keeps the current fonts as defaults", () => {
    expect(DEFAULT_FONT_DISPLAY).toBe("press-start-2p");
    expect(DEFAULT_FONT_BODY).toBe("jetbrains-mono");
  });

  it("accepts only the two values per preference", () => {
    expect(parseFontDisplay("press-start-2p")).toBe("press-start-2p");
    expect(parseFontDisplay("jetbrains-mono")).toBe("jetbrains-mono");
    expect(parseFontDisplay("roboto")).toBe("roboto");
    expect(parseFontBody("jetbrains-mono")).toBe("jetbrains-mono");
    expect(parseFontBody("roboto")).toBe("roboto");
    for (const value of [
      null,
      undefined,
      "",
      "Roboto",
      "comic-sans",
      "monospace",
      0,
      {},
    ]) {
      expect(parseFontDisplay(value)).toBeNull();
      expect(parseFontBody(value)).toBeNull();
    }
  });

  it("defaults with no browser globals (SSR)", () => {
    expect(resolveInitialFontDisplay()).toBe("press-start-2p");
    expect(resolveInitialFontBody()).toBe("jetbrains-mono");
  });

  it("restores independently saved fonts", () => {
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({
        state: { fontDisplay: "roboto", fontBody: "jetbrains-mono" },
      }),
    });
    expect(resolveInitialFontDisplay()).toBe("roboto");
    expect(resolveInitialFontBody()).toBe("jetbrains-mono");
  });

  it("restores JetBrains Mono as a title font", () => {
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({
        state: { fontDisplay: "jetbrains-mono", fontBody: "roboto" },
      }),
    });
    expect(resolveInitialFontDisplay()).toBe("jetbrains-mono");
    expect(resolveInitialFontBody()).toBe("roboto");
  });

  it("falls back per preference on invalid values", () => {
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({
        state: { fontDisplay: "comic-sans", fontBody: "roboto" },
      }),
    });
    expect(resolveInitialFontDisplay()).toBe("press-start-2p");
    expect(resolveInitialFontBody()).toBe("roboto");
  });

  it("stays compatible with old saves carrying only the layout mode", () => {
    stubBrowser({
      innerWidth: 1280,
      stored: JSON.stringify({ state: { layoutMode: "pixel-perfect" } }),
    });
    expect(resolveInitialLayoutMode()).toBe("pixel-perfect");
    expect(resolveInitialFontDisplay()).toBe("press-start-2p");
    expect(resolveInitialFontBody()).toBe("jetbrains-mono");
  });

  it("falls back on corrupt or unavailable storage", () => {
    stubBrowser({ innerWidth: 1280, stored: "garbage" });
    expect(resolveInitialFontDisplay()).toBe("press-start-2p");
    expect(resolveInitialFontBody()).toBe("jetbrains-mono");
    stubBrowser({ innerWidth: 1280, stored: "throw" });
    expect(resolveInitialFontDisplay()).toBe("press-start-2p");
    expect(resolveInitialFontBody()).toBe("jetbrains-mono");
  });
});

describe("font preferences — store persistence (same system)", () => {
  function stubUiStorage(saved: string | null) {
    let value = saved;
    const storage = {
      getItem: (_key: string) => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
      removeItem: (_key: string) => {
        value = null;
      },
    };
    vi.stubGlobal("window", { innerWidth: 1280, localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    return storage;
  }

  async function freshStore() {
    vi.resetModules();
    return (await import("@/features/shared/ui-store")).useUiStore;
  }

  it("starts from defaults on first access and preserves the layout mode", async () => {
    stubUiStorage(null);
    const store = await freshStore();
    expect(store.getState().fontDisplay).toBe("press-start-2p");
    expect(store.getState().fontBody).toBe("jetbrains-mono");
    expect(store.getState().layoutMode).toBe("fullscreen");
  });

  it("restores saved fonts without touching the layout mode", async () => {
    stubUiStorage(
      JSON.stringify({
        state: {
          layoutMode: "pixel-perfect",
          fontDisplay: "roboto",
          fontBody: "roboto",
        },
      }),
    );
    const store = await freshStore();
    expect(store.getState().fontDisplay).toBe("roboto");
    expect(store.getState().fontBody).toBe("roboto");
    expect(store.getState().layoutMode).toBe("pixel-perfect");
  });

  it("applies immediately, persists, and keeps old saves working", async () => {
    const storage = stubUiStorage(
      JSON.stringify({ state: { layoutMode: "fullscreen" } }),
    );
    const sheet = stubPreferenceStylesheet();
    const store = await freshStore();
    expect(store.getState().fontDisplay).toBe("press-start-2p");
    store.getState().setFontDisplay("roboto");
    store.getState().setFontBody("roboto");
    store.getState().setLayoutMode("pixel-perfect");
    store.getState().setGridDensity(12);
    expect(store.getState().fontDisplay).toBe("roboto");
    expect(store.getState().fontBody).toBe("roboto");
    expect(store.getState().layoutMode).toBe("pixel-perfect");
    expect(store.getState().gridDensity).toBe(12);
    expect(sheet.cssRules[0].style.getPropertyValue("--ss-pref-layout-zoom"))
      .toBe("80%");
    expect(sheet.cssRules[0].style.getPropertyValue("--ss-pref-grid-columns-1476"))
      .toBe("12");
    expect(sheet.cssRules[0].style.getPropertyValue("--font-display-name"))
      .toContain("var(--font-roboto)");
    expect(sheet.cssRules[0].style.getPropertyValue("--font-body-name"))
      .toContain("var(--font-roboto)");
    const saved = JSON.parse(storage.getItem(LAYOUT_STORAGE_KEY) ?? "{}") as {
      state?: Record<string, unknown>;
    };
    expect(saved.state?.fontDisplay).toBe("roboto");
    expect(saved.state?.fontBody).toBe("roboto");
    expect(saved.state?.layoutMode).toBe("pixel-perfect");
    const reloadedStore = await freshStore();
    expect(reloadedStore.getState()).toMatchObject({
      layoutMode: "pixel-perfect",
      fontDisplay: "roboto",
      fontBody: "roboto",
      gridDensity: 12,
    });
  });

  it("changing only the body font does not mark display choice as explicit", async () => {
    stubUiStorage(JSON.stringify({ state: { layoutMode: "fullscreen" } }));
    const sheet = stubPreferenceStylesheet();
    const store = await freshStore();
    store.getState().setFontBody("roboto");
    expect(sheet.cssRules[0].style.getPropertyValue("--font-body-name"))
      .toContain("var(--font-roboto)");
    expect(
      sheet.cssRules[0].style.getPropertyValue("--ss-mobile-font-functional"),
    ).toBe("");
  });

  it("falls back to defaults on invalid saved fonts", async () => {
    stubUiStorage(
      JSON.stringify({
        state: { fontDisplay: "comic-sans", fontBody: 42 },
      }),
    );
    const store = await freshStore();
    expect(store.getState().fontDisplay).toBe("press-start-2p");
    expect(store.getState().fontBody).toBe("jetbrains-mono");
  });

  it("restores, validates, and persists grid density in the existing UI record", async () => {
    const storage = stubUiStorage(
      JSON.stringify({
        state: {
          layoutMode: "fullscreen",
          fontDisplay: "roboto",
          gridDensity: 10,
        },
      }),
    );
    const store = await freshStore();
    expect(store.getState().gridDensity).toBe(10);
    store.getState().setGridDensity(12);
    expect(store.getState().gridDensity).toBe(12);
    expect(store.getState().fontDisplay).toBe("roboto");
    const saved = JSON.parse(storage.getItem(LAYOUT_STORAGE_KEY) ?? "{}") as {
      state?: Record<string, unknown>;
    };
    expect(saved.state?.gridDensity).toBe(12);

    const invalid = stubUiStorage(
      JSON.stringify({ state: { gridDensity: 9 } }),
    );
    const fallbackStore = await freshStore();
    expect(fallbackStore.getState().gridDensity).toBe(6);
    expect(invalid.getItem(LAYOUT_STORAGE_KEY)).toContain('"gridDensity":9');
  });
});

describe("font preferences — wiring (source level)", () => {
  it("loads Roboto through the existing next/font mechanism", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("Roboto");
    expect(layout).toContain('variable: "--font-roboto"');
    for (const variable of [
      "displayFont.variable",
      "bodyFont.variable",
      "robotoFont.variable",
    ]) {
      expect(layout).toContain(variable);
    }
    expect(layout).toContain("LAYOUT_INIT_SCRIPT");
  });

  it("sets font variables before first paint without root attributes", () => {
    expect(LAYOUT_INIT_SCRIPT).toContain("--font-display-name");
    expect(LAYOUT_INIT_SCRIPT).toContain("--font-body-name");
    expect(LAYOUT_INIT_SCRIPT).toContain("press-start-2p");
    expect(LAYOUT_INIT_SCRIPT).toContain("jetbrains-mono");
    expect(LAYOUT_INIT_SCRIPT).toContain("roboto");
    expect(LAYOUT_INIT_SCRIPT).not.toContain("setAttribute");
  });

  it("drives fonts from centralized variables in CSS", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("--font-body-name");
    expect(css).toContain("--font-display-name");
    expect(css).not.toContain("data-font-body");
    expect(css).not.toContain("data-font-display");
    expect(LAYOUT_INIT_SCRIPT).toContain("--font-roboto");
    expect(css).toContain("font-family: var(--font-body-name)");
    expect(css).toContain("font-family: var(--font-display-name)");
    // No hardcoded display family remains in app CSS.
    expect(css).not.toContain('"Press Start 2P"');
  });

  it("preserves selected display font title scaling", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".font-display");
    expect(LAYOUT_INIT_SCRIPT).toContain("calc(1em * 1.2)");
    expect(LAYOUT_INIT_SCRIPT).toContain("calc(1em * 1.1)");
    expect(LAYOUT_INIT_SCRIPT).not.toContain("transform:");
  });

  it("renders both font selects in the appearance section", () => {
    const view = readFileSync("features/settings/settings-view.tsx", "utf8");
    for (const label of ["Fonte dos títulos", "Fonte dos textos"]) {
      expect(view).toContain(label);
    }
    for (const value of [
      "press-start-2p",
      "jetbrains-mono",
      'value="roboto"',
    ]) {
      expect(view).toContain(value);
    }
    expect(view).toContain("setFontDisplay");
    expect(view).toContain("setFontBody");
  });

  it("keeps title and body fonts independent in the store", async () => {
    vi.resetModules();
    const innerWidth = 1280;
    let value: string | null = null;
    const storage = {
      getItem: (_key: string) => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
      removeItem: (_key: string) => {
        value = null;
      },
    };
    vi.stubGlobal("window", { innerWidth, localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    const store = (await import("@/features/shared/ui-store")).useUiStore;
    store.getState().setFontDisplay("jetbrains-mono");
    store.getState().setFontBody("roboto");
    expect(store.getState().fontDisplay).toBe("jetbrains-mono");
    expect(store.getState().fontBody).toBe("roboto");
    const saved = JSON.parse(value ?? "{}") as {
      state?: Record<string, unknown>;
    };
    expect(saved.state?.fontDisplay).toBe("jetbrains-mono");
    expect(saved.state?.fontBody).toBe("roboto");
  });
});

describe("pre-paint display preference intent", () => {
  function runInitScript(stored: string | null | "throw") {
    const rules: Array<{
      selectorText: string;
      style: {
        values: Record<string, string>;
        setProperty: (key: string, value: string) => void;
      };
    }> = [];
    const sheet = {
      cssRules: rules,
      deleteRule(index: number) {
        rules.splice(index, 1);
      },
      insertRule(text: string, index: number) {
        const rule = {
          selectorText: text.slice(0, text.indexOf("{")).trim(),
          style: {
            values: {} as Record<string, string>,
            setProperty(key: string, value: string) {
              this.values[key] = value;
            },
          },
        };
        rules.splice(index, 0, rule);
        return index;
      },
    };
    const windowStub = {
      innerWidth: 390,
      localStorage: {
        getItem: () => {
          if (stored === "throw") throw new Error("storage unavailable");
          return stored;
        },
      },
    };
    const documentStub = {
      getElementById: (id: string) =>
        id === PREFERENCE_STYLESHEET_ID ? { sheet } : null,
    };
    runInNewContext(LAYOUT_INIT_SCRIPT, {
      window: windowStub,
      document: documentStub,
    });
    return rules;
  }

  it("marks only valid stored display preferences as explicit", () => {
    expect(
      runInitScript(null)[0].style.values["--ss-mobile-font-functional"],
    ).toBeUndefined();
    expect(
      runInitScript(JSON.stringify({ state: { fontDisplay: "roboto" } }))[0]
        .style.values["--ss-mobile-font-functional"],
    ).toBe("var(--font-display-name, var(--font-display))");
    expect(
      runInitScript(JSON.stringify({ state: { fontDisplay: "invalid" } }))[
        0
      ].style.values["--ss-mobile-font-functional"],
    ).toBeUndefined();
    expect(
      runInitScript("throw")[0].style.values["--ss-mobile-font-functional"],
    ).toBeUndefined();
  });
});

describe("mobile typography defaults", () => {
  it("uses mono for new semantic functional titles unless a valid display choice exists", () => {
    const css = readFileSync("app/rpgui-mobile.css", "utf8");
    expect(css).toContain("--ss-mobile-font-functional: var(--ss-mobile-font-body)");
    expect(LAYOUT_INIT_SCRIPT).toContain("--ss-mobile-font-functional");
    for (const display of ["press-start-2p", "jetbrains-mono", "roboto"]) {
      expect(LAYOUT_INIT_SCRIPT).toContain(display);
    }
    expect(css).toContain(".ss-page-title");
    expect(css).toContain(".ss-section-title");
    expect(css).toContain(".ss-card-title");
    expect(css).toContain(".ss-pixel-title");
    expect(css).toContain(".ss-body-text");
    expect(css).toContain(".ss-metadata");
  });
});
