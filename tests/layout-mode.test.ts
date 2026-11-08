/**
 * Layout-mode preference: parsing, first-paint resolution, and the
 * no-flash wiring (pre-paint script + attribute-driven CSS).
 * No DOM test infrastructure in the repo — logic is unit-tested with
 * stubbed globals, wiring is asserted at source level.
 */

import { readFileSync } from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyFontAttributes,
  applyLayoutModeAttribute,
  DEFAULT_FONT_BODY,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_LAYOUT_MODE,
  isNarrowViewport,
  LAYOUT_INIT_SCRIPT,
  LAYOUT_STORAGE_KEY,
  parseFontBody,
  parseFontDisplay,
  parseLayoutMode,
  readStoredLayoutMode,
  resolveInitialFontBody,
  resolveInitialFontDisplay,
  resolveInitialLayoutMode,
} from "@/features/shared/layout-mode";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
});

describe("applyLayoutModeAttribute", () => {
  it("is a no-op without a DOM", () => {
    expect(() => applyLayoutModeAttribute("fullscreen")).not.toThrow();
  });

  it("writes the attribute on manual changes", () => {
    const setAttribute = vi.fn();
    vi.stubGlobal("document", { documentElement: { setAttribute } });
    applyLayoutModeAttribute("pixel-perfect");
    expect(setAttribute).toHaveBeenCalledWith(
      "data-layout-mode",
      "pixel-perfect",
    );
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

  it("inlines a parser-blocking init script in the root layout", () => {
    expect(LAYOUT_INIT_SCRIPT).toContain("save-state-ui");
    expect(LAYOUT_INIT_SCRIPT).toContain("data-layout-mode");
    expect(LAYOUT_INIT_SCRIPT).toContain("fullscreen");
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("LAYOUT_INIT_SCRIPT");
    expect(layout).toContain("<head>");
  });

  it("drives frame geometry from the attribute in CSS", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain('html[data-layout-mode="pixel-perfect"]');
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

describe("applyFontAttributes", () => {
  it("is a no-op without a DOM", () => {
    expect(() =>
      applyFontAttributes("roboto", "roboto"),
    ).not.toThrow();
  });

  it("writes both font attributes on manual changes", () => {
    const setAttribute = vi.fn();
    vi.stubGlobal("document", { documentElement: { setAttribute } });
    applyFontAttributes("roboto", "jetbrains-mono");
    expect(setAttribute).toHaveBeenCalledWith("data-font-display", "roboto");
    expect(setAttribute).toHaveBeenCalledWith(
      "data-font-body",
      "jetbrains-mono",
    );
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
    const store = await freshStore();
    expect(store.getState().fontDisplay).toBe("press-start-2p");
    store.getState().setFontDisplay("roboto");
    store.getState().setFontBody("roboto");
    expect(store.getState().fontDisplay).toBe("roboto");
    expect(store.getState().fontBody).toBe("roboto");
    // Layout mode untouched by font changes.
    expect(store.getState().layoutMode).toBe("fullscreen");
    const saved = JSON.parse(storage.getItem(LAYOUT_STORAGE_KEY) ?? "{}") as {
      state?: Record<string, unknown>;
    };
    expect(saved.state?.fontDisplay).toBe("roboto");
    expect(saved.state?.fontBody).toBe("roboto");
    expect(saved.state?.layoutMode).toBe("fullscreen");
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

  it("sets both font attributes before first paint", () => {
    expect(LAYOUT_INIT_SCRIPT).toContain("data-font-display");
    expect(LAYOUT_INIT_SCRIPT).toContain("data-font-body");
    expect(LAYOUT_INIT_SCRIPT).toContain("press-start-2p");
    expect(LAYOUT_INIT_SCRIPT).toContain("jetbrains-mono");
    expect(LAYOUT_INIT_SCRIPT).toContain("roboto");
    // All three title fonts validate in the pre-paint script.
    const script = LAYOUT_INIT_SCRIPT;
    for (const value of ["press-start-2p", "jetbrains-mono", "roboto"]) {
      expect(script).toContain(`s.fontDisplay==="${value}"`);
    }
  });

  it("drives fonts from centralized variables in CSS", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("--font-body-name");
    expect(css).toContain("--font-display-name");
    expect(css).toContain('html[data-font-body="roboto"]');
    expect(css).toContain('html[data-font-display="roboto"]');
    expect(css).toContain("font-family: var(--font-body-name)");
    expect(css).toContain("font-family: var(--font-display-name)");
    // No hardcoded display family remains in app CSS.
    expect(css).not.toContain('"Press Start 2P"');
  });

  it("scales titles only under explicit display fonts", () => {
    const css = readFileSync("app/globals.css", "utf8");
    // Compensation tokens exist and default to neutral (Roboto untouched).
    expect(css).toContain("--font-display-title-scale: 1;");
    expect(css).toContain("--font-display-title-leading:");
    // Press Start 2P compensation is preserved exactly (1.2, headings).
    expect(css).toContain("--font-display-title-scale: 1.2;");
    for (const heading of ["h1.font-display", "h2.font-display", "h3.font-display"]) {
      expect(css).toContain(`html[data-font-display="press-start-2p"] ${heading}`);
    }
    // Roboto gets its own milder compensation; never scale() transforms.
    // (The pre-existing layout `zoom:` in .layout-zoom is unrelated.)
    expect(css).toContain("--font-display-title-scale: 1.1;");
    expect(css).toContain('html[data-font-display="roboto"] h1.font-display');
    expect(css).toContain('html[data-font-display="roboto"] .rpgui-button');
    expect(css).not.toContain("scale(");
    expect(css).not.toContain("transform:");
    // JetBrains Mono display reuses the loaded body stack, unscaled.
    expect(css).toContain('html[data-font-display="jetbrains-mono"]');
    expect(css).toContain("--font-display-name: var(--font-body);");
    expect(css).not.toContain('html[data-font-display="jetbrains-mono"] h1');
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
