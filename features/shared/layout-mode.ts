/**
 * Layout-mode preference: single source of truth for the storage key,
 * the valid values, the default, and the pre-paint initialization.
 *
 * This module also owns the two font preferences (title font and body
 * font): same storage key, same zustand `persist` contract, same
 * parser-blocking init script — one preference system, not two.
 *
 * Client-safe (no React, no side effects on import): `app/layout.tsx`
 * inlines `LAYOUT_INIT_SCRIPT` as a parser-blocking head script, so the
 * `data-layout-mode`, `data-font-display` and `data-font-body`
 * attributes exist before first paint and the CSS in `app/globals.css`
 * renders the correct frame and fonts immediately — no flash,
 * no late switch, no `useEffect` involved. The zustand store
 * (`features/shared/ui-store.ts`) derives the same values, so React and
 * CSS always agree and hydration stays mismatch-free.
 *
 * Compatibility: the storage key (`save-state-ui`) and the values
 * (`pixel-perfect`/`fullscreen`, nested as `{ state: { layoutMode } }`)
 * are exactly the zustand `persist` contract, so existing saved
 * preferences keep working. Font keys are additive: old saves without
 * them resolve to the current defaults. Narrow viewports always resolve
 * to fullscreen (legacy responsive behavior); missing, invalid, or
 * unreadable storage resolves to fullscreen (the default).
 */

export type LayoutMode = "pixel-perfect" | "fullscreen";

export const LAYOUT_MODES: readonly LayoutMode[] = [
  "pixel-perfect",
  "fullscreen",
];

/** Shared with the zustand `persist` middleware (single-sourced). */
export const LAYOUT_STORAGE_KEY = "save-state-ui";

export const DEFAULT_LAYOUT_MODE: LayoutMode = "fullscreen";

/** Mirrors the `md` breakpoint: below it the layout is always fullscreen. */
export const MOBILE_BREAKPOINT_PX = 768;

export function parseLayoutMode(value: unknown): LayoutMode | null {
  return value === "pixel-perfect" || value === "fullscreen" ? value : null;
}

/** Strict read of the persisted preference; `null` on any failure. */
export function readStoredLayoutMode(): LayoutMode | null {
  return parseLayoutMode(readStoredState()?.layoutMode);
}

/** Raw persisted `state` object (or `null`): shared by every preference. */
function readStoredState(): {
  layoutMode?: unknown;
  fontDisplay?: unknown;
  fontBody?: unknown;
} | null {
  try {
    if (typeof window === "undefined" || !("localStorage" in window)) {
      return null;
    }
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const state = (parsed as { state?: unknown }).state;
    if (typeof state !== "object" || state === null) return null;
    return state as {
      layoutMode?: unknown;
      fontDisplay?: unknown;
      fontBody?: unknown;
    };
  } catch {
    // Unavailable storage, denied access, or corrupt JSON → defaults.
    return null;
  }
}

export function isNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT_PX;
}

/** Narrow → fullscreen; stored valid → stored; otherwise the default. */
export function resolveInitialLayoutMode(): LayoutMode {
  if (isNarrowViewport()) return "fullscreen";
  return readStoredLayoutMode() ?? DEFAULT_LAYOUT_MODE;
}

/** Keeps the pre-paint attribute in sync after manual mode changes. */
export function applyLayoutModeAttribute(mode: LayoutMode): void {
  try {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-layout-mode", mode);
  } catch {
    // DOM unavailable (SSR) — neutral markup keeps rendering safe.
  }
}

/**
 * Parser-blocking head snippet. Mirrors `resolveInitialLayoutMode` plus
 * the font resolvers below — keep them in sync. Runs before first paint,
 * so no FOUC and no hydration mismatch (the markup itself is neutral;
 * only these attributes plus CSS decide frame geometry and fonts).
 */
export const LAYOUT_INIT_SCRIPT = `(function(){try{var narrow=window.matchMedia?window.matchMedia("(max-width: 767px)").matches:window.innerWidth<768;var stored=null;var fd="press-start-2p";var fb="jetbrains-mono";try{var raw=window.localStorage.getItem("save-state-ui");if(raw){var p=JSON.parse(raw);var s=p&&p.state;if(s){var v=s.layoutMode;if(v==="pixel-perfect"||v==="fullscreen"){stored=v;}if(s.fontDisplay==="press-start-2p"||s.fontDisplay==="jetbrains-mono"||s.fontDisplay==="roboto"){fd=s.fontDisplay;}if(s.fontBody==="jetbrains-mono"||s.fontBody==="roboto"){fb=s.fontBody;}}}}catch(e){}var de=document.documentElement;de.setAttribute("data-layout-mode",narrow?"fullscreen":(stored||"fullscreen"));de.setAttribute("data-font-display",fd);de.setAttribute("data-font-body",fb);}catch(e){}})();`;

/* ---- Preferências tipográficas (mesmo sistema, ver cabeçalho) ---- */

export type FontDisplay = "press-start-2p" | "jetbrains-mono" | "roboto";
export type FontBody = "jetbrains-mono" | "roboto";

export const FONT_DISPLAYS: readonly FontDisplay[] = [
  "press-start-2p",
  "jetbrains-mono",
  "roboto",
];
export const FONT_BODIES: readonly FontBody[] = ["jetbrains-mono", "roboto"];

/** Current defaults — the existing fonts. Never change silently. */
export const DEFAULT_FONT_DISPLAY: FontDisplay = "press-start-2p";
export const DEFAULT_FONT_BODY: FontBody = "jetbrains-mono";

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

/** Stored valid → stored; missing/invalid/unreadable → the default. */
export function resolveInitialFontDisplay(): FontDisplay {
  return parseFontDisplay(readStoredState()?.fontDisplay) ?? DEFAULT_FONT_DISPLAY;
}

/** Stored valid → stored; missing/invalid/unreadable → the default. */
export function resolveInitialFontBody(): FontBody {
  return parseFontBody(readStoredState()?.fontBody) ?? DEFAULT_FONT_BODY;
}

/** Keeps the pre-paint font attributes in sync after manual changes. */
export function applyFontAttributes(display: FontDisplay, body: FontBody): void {
  try {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-font-display", display);
    root.setAttribute("data-font-body", body);
  } catch {
    // DOM unavailable (SSR) — neutral markup keeps rendering safe.
  }
}

/* Loading-screen progress helpers moved to components/RPGUI/loading-progress.ts. */
