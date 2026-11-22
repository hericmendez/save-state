"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyPreferenceStyles,
  DEFAULT_FONT_BODY,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_GRID_DENSITY,
  LAYOUT_STORAGE_KEY,
  PREFERENCE_STYLESHEET_ID,
  parseFontBody,
  parseFontDisplay,
  parseGridDensity,
  readUiPreferenceSnapshot,
  resolveInitialFontBody,
  resolveInitialFontDisplay,
  resolveInitialGridDensity,
  resolveInitialLayoutMode,
  type UiPreferenceSnapshot,
  type FontBody,
  type FontDisplay,
  type GridDensity,
  type LayoutMode,
} from "./layout-mode";

export type { FontBody, FontDisplay, GridDensity, LayoutMode };

interface UiState {
  layoutMode: LayoutMode;
  fontDisplay: FontDisplay;
  fontBody: FontBody;
  gridDensity: GridDensity;
  isLoading: boolean;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleLayoutMode: () => void;
  setFontDisplay: (font: FontDisplay) => void;
  setFontBody: (font: FontBody) => void;
  setGridDensity: (density: GridDensity) => void;
  showLoading: () => void;
  hideLoading: () => void;
}

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}

function applyPreferenceOverrides(
  overrides: Partial<UiPreferenceSnapshot>,
): void {
  const current = readUiPreferenceSnapshot();
  applyPreferenceStyles(
    { ...current, ...overrides },
    PREFERENCE_STYLESHEET_ID,
  );
}

/**
 * Genuine client UI state only. No server data, no session: authentication
 * comes from the server session (httpOnly cookie), never from this store.
 *
 * The initial mode is derived synchronously (stored preference, fullscreen
 * default — never a hardcoded pixel-perfect first paint), and the
 * `persist` merge re-derives it, so even a late rehydration can never
 * flip the visible layout. Font preferences are validated on merge
 * (invalid or absent values fall back to the current defaults without
 * touching the layout mode). Every change also updates the preference
 * CSSOM sheet that owns frame geometry, typography and grid density.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      layoutMode: resolveInitialLayoutMode(),
      fontDisplay: resolveInitialFontDisplay(),
      fontBody: resolveInitialFontBody(),
      gridDensity: resolveInitialGridDensity(),
      isLoading: false,
      setLayoutMode: (mode) => {
        const next = isMobileDevice() ? "fullscreen" : mode;
        applyPreferenceOverrides({ layoutMode: next });
        set({ layoutMode: next });
      },
      toggleLayoutMode: () => {
        if (isMobileDevice()) return;
        const next =
          get().layoutMode === "pixel-perfect" ? "fullscreen" : "pixel-perfect";
        applyPreferenceOverrides({ layoutMode: next });
        set({ layoutMode: next });
      },
      setFontDisplay: (font) => {
        applyPreferenceOverrides({
          fontDisplay: font,
          fontDisplayExplicit: true,
          fontBody: get().fontBody,
        });
        set({ fontDisplay: font });
      },
      setFontBody: (font) => {
        applyPreferenceOverrides({ fontBody: font });
        set({ fontBody: font });
      },
      setGridDensity: (density) => {
        applyPreferenceOverrides({ gridDensity: density });
        set({ gridDensity: density });
      },
      showLoading: () => set({ isLoading: true }),
      hideLoading: () => set({ isLoading: false }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      partialize: (state) => ({
        layoutMode: state.layoutMode,
        fontDisplay: state.fontDisplay,
        fontBody: state.fontBody,
        gridDensity: state.gridDensity,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as {
          fontDisplay?: unknown;
          fontBody?: unknown;
          gridDensity?: unknown;
        };
        return {
          ...current,
          ...(persisted as Record<string, unknown>),
          layoutMode: resolveInitialLayoutMode(),
          fontDisplay:
            parseFontDisplay(saved.fontDisplay) ?? DEFAULT_FONT_DISPLAY,
          fontBody: parseFontBody(saved.fontBody) ?? DEFAULT_FONT_BODY,
          gridDensity:
            parseGridDensity(saved.gridDensity) ?? DEFAULT_GRID_DENSITY,
        };
      },
    },
  ),
);
