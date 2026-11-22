/**
 * Browser preferences shared by the parser-blocking bootstrap and Zustand.
 * The root element is never mutated: preference CSS is installed in the
 * CSSOM of a server-rendered, initially empty style element before paint.
 */

export type LayoutMode = "pixel-perfect" | "fullscreen";
export type GridDensity = 6 | 8 | 10 | 12;
export type FontDisplay = "press-start-2p" | "jetbrains-mono" | "roboto";
export type FontBody = "jetbrains-mono" | "roboto";

export type UiPreferenceSnapshot = {
  layoutMode: LayoutMode;
  fontDisplay: FontDisplay;
  fontDisplayExplicit: boolean;
  fontBody: FontBody;
  gridDensity: GridDensity;
};

export const LAYOUT_MODES: readonly LayoutMode[] = [
  "pixel-perfect",
  "fullscreen",
];
export const LAYOUT_STORAGE_KEY = "save-state-ui";
export const PREFERENCE_STYLESHEET_ID = "save-state-preference-styles";
export const DEFAULT_LAYOUT_MODE: LayoutMode = "fullscreen";
export const MOBILE_BREAKPOINT_PX = 768;
export const GRID_DENSITIES: readonly GridDensity[] = [6, 8, 10, 12];
export const DEFAULT_GRID_DENSITY: GridDensity = 6;
export const DEFAULT_FONT_DISPLAY: FontDisplay = "press-start-2p";
export const DEFAULT_FONT_BODY: FontBody = "jetbrains-mono";

export function parseLayoutMode(value: unknown): LayoutMode | null {
  return value === "pixel-perfect" || value === "fullscreen" ? value : null;
}

export function parseGridDensity(value: unknown): GridDensity | null {
  return GRID_DENSITIES.find((density) => density === value) ?? null;
}

export function parseFontDisplay(value: unknown): FontDisplay | null {
  return value === "press-start-2p" ||
    value === "jetbrains-mono" ||
    value === "roboto"
    ? value
    : null;
}

export function parseFontBody(value: unknown): FontBody | null {
  return value === "jetbrains-mono" || value === "roboto" ? value : null;
}

/**
 * This function is also serialized into the inline bootstrap. Keep it
 * self-contained so SSR-independent parsing has one implementation.
 */
export function resolveUiPreferences(
  raw: string | null,
  innerWidth: number,
): UiPreferenceSnapshot {
  const defaultLayoutMode = "fullscreen";
  const mobileBreakpoint = 768;
  const defaultFontDisplay = "press-start-2p";
  const defaultFontBody = "jetbrains-mono";
  const defaultGridDensity = 6;
  let state: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === "object" && parsed !== null) {
      const saved = (parsed as { state?: unknown }).state;
      if (typeof saved === "object" && saved !== null) {
        state = saved as Record<string, unknown>;
      }
    }
  } catch {
    // Missing/corrupt data uses the same defaults as the server.
  }

  const savedLayout =
    state.layoutMode === "pixel-perfect" || state.layoutMode === "fullscreen"
      ? state.layoutMode
      : defaultLayoutMode;
  const fontDisplay =
    state.fontDisplay === "press-start-2p" ||
    state.fontDisplay === "jetbrains-mono" ||
    state.fontDisplay === "roboto"
      ? state.fontDisplay
      : defaultFontDisplay;
  const fontBody =
    state.fontBody === "jetbrains-mono" || state.fontBody === "roboto"
      ? state.fontBody
      : defaultFontBody;
  const gridDensity =
    state.gridDensity === 6 ||
    state.gridDensity === 8 ||
    state.gridDensity === 10 ||
    state.gridDensity === 12
      ? state.gridDensity
      : defaultGridDensity;

  return {
    layoutMode:
      innerWidth < mobileBreakpoint ? "fullscreen" : savedLayout,
    fontDisplay,
    fontDisplayExplicit:
      state.fontDisplay === "press-start-2p" ||
      state.fontDisplay === "jetbrains-mono" ||
      state.fontDisplay === "roboto",
    fontBody,
    gridDensity,
  };
}

function readStoredPreferenceSnapshot(): UiPreferenceSnapshot {
  let raw: string | null = null;
  let width = MOBILE_BREAKPOINT_PX;
  try {
    if (typeof window !== "undefined") {
      width = window.innerWidth;
      raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    }
  } catch {
    // Storage can be disabled by browser policy; defaults remain usable.
  }
  return resolveUiPreferences(raw, width);
}

export function readUiPreferenceSnapshot(): UiPreferenceSnapshot {
  return readStoredPreferenceSnapshot();
}

export function isNarrowViewport(): boolean {
  return typeof window !== "undefined" &&
    window.innerWidth < MOBILE_BREAKPOINT_PX;
}

export function resolveInitialLayoutMode(): LayoutMode {
  return readStoredPreferenceSnapshot().layoutMode;
}

export function resolveInitialGridDensity(): GridDensity {
  return readStoredPreferenceSnapshot().gridDensity;
}

export function resolveInitialFontDisplay(): FontDisplay {
  return readStoredPreferenceSnapshot().fontDisplay;
}

export function resolveInitialFontBody(): FontBody {
  return readStoredPreferenceSnapshot().fontBody;
}

export function readStoredLayoutMode(): LayoutMode | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null) return null;
    const state = (parsed as { state?: { layoutMode?: unknown } }).state;
    return parseLayoutMode(state?.layoutMode);
  } catch {
    return null;
  }
}

/**
 * Applies the current snapshot through CSSOM, not DOM attributes. The style
 * element is present in server HTML and remains textually empty during React
 * hydration; insertRule changes only its stylesheet's CSSOM.
 */
export function applyPreferenceStyles(
  preferences: UiPreferenceSnapshot,
  styleElementId: string,
): boolean {
  if (typeof document === "undefined") return false;
  const styleElement = document.getElementById(styleElementId) as
    | HTMLStyleElement
    | null;
  const sheet = styleElement?.sheet;
  if (!sheet) return false;

  while (sheet.cssRules.length > 0) sheet.deleteRule(0);

  const pixelPerfect = preferences.layoutMode === "pixel-perfect";
  const displayStack =
    preferences.fontDisplay === "roboto"
      ? "var(--font-roboto), system-ui, sans-serif"
      : preferences.fontDisplay === "jetbrains-mono"
        ? "var(--font-body)"
        : "var(--font-display), system-ui";
  const bodyStack =
    preferences.fontBody === "roboto"
      ? "var(--font-roboto), system-ui, sans-serif"
      : "var(--font-body)";
  const declarations: Record<string, string> = {
    "--ss-pref-layout-max-width": pixelPerfect ? "133.33vh" : "none",
    "--ss-pref-layout-aspect-ratio": pixelPerfect ? "4 / 3" : "auto",
    "--ss-pref-layout-inner-min-height": pixelPerfect ? "auto" : "100dvh",
    "--ss-pref-layout-frame-height-desktop": pixelPerfect
      ? "calc(100dvh - 60px)"
      : "100dvh",
    "--ss-pref-layout-frame-margin": pixelPerfect ? "30px" : "0px",
    "--ss-pref-layout-zoom": pixelPerfect ? "80%" : "100%",
    "--font-display-name": displayStack,
    "--font-body-name": bodyStack,
  };

  const gridBreakpoints = [856, 980, 1104, 1228, 1352, 1476];
  gridBreakpoints.forEach((breakpoint, index) => {
    declarations[`--ss-pref-grid-columns-${breakpoint}`] = String(
      Math.min(preferences.gridDensity, 7 + index),
    );
  });

  if (preferences.fontDisplayExplicit) {
    declarations["--ss-mobile-font-functional"] =
      "var(--font-display-name, var(--font-display))";
  }

  sheet.insertRule(":root {}", 0);
  const rootRule = sheet.cssRules[0] as CSSStyleRule;
  for (const [property, value] of Object.entries(declarations)) {
    rootRule.style.setProperty(property, value);
  }

  const titleSelectors =
    "html:root h1.font-display, html:root h2.font-display, html:root h3.font-display";
  if (preferences.fontDisplay === "press-start-2p") {
    sheet.insertRule(
      `${titleSelectors} { font-size: calc(1em * 1.2); line-height: 1.6; }`,
      sheet.cssRules.length,
    );
  } else if (preferences.fontDisplay === "roboto") {
    sheet.insertRule(
      `${titleSelectors} { font-size: calc(1em * 1.1); }`,
      sheet.cssRules.length,
    );
    sheet.insertRule(
      "html:root .rpgui-button { font-size: 1rem; }",
      sheet.cssRules.length,
    );
  }

  return true;
}

/**
 * Parser-blocking bootstrap. The resolver and CSSOM applier are serialized
 * from the same functions used by the client store, so they cannot drift.
 */
export const LAYOUT_INIT_SCRIPT = `(function(){try{var raw=null;try{raw=window.localStorage.getItem("save-state-ui")}catch(e){}var preferences=(${resolveUiPreferences.toString()})(raw,window.innerWidth);(${applyPreferenceStyles.toString()})(preferences,${JSON.stringify(PREFERENCE_STYLESHEET_ID)});}catch(e){}})();`;
