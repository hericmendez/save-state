"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyFontAttributes,
  applyLayoutModeAttribute,
  DEFAULT_FONT_BODY,
  DEFAULT_FONT_DISPLAY,
  LAYOUT_STORAGE_KEY,
  parseFontBody,
  parseFontDisplay,
  resolveInitialFontBody,
  resolveInitialFontDisplay,
  resolveInitialLayoutMode,
  type FontBody,
  type FontDisplay,
  type LayoutMode,
} from "./layout-mode";

export type { FontBody, FontDisplay, LayoutMode };

interface UiState {
  layoutMode: LayoutMode;
  fontDisplay: FontDisplay;
  fontBody: FontBody;
  isLoading: boolean;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleLayoutMode: () => void;
  setFontDisplay: (font: FontDisplay) => void;
  setFontBody: (font: FontBody) => void;
  showLoading: () => void;
  hideLoading: () => void;
}

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
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
 * touching the layout mode). Every change also syncs the pre-paint
 * attributes that own the frame geometry and the fonts in CSS.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      layoutMode: resolveInitialLayoutMode(),
      fontDisplay: resolveInitialFontDisplay(),
      fontBody: resolveInitialFontBody(),
      isLoading: false,
      setLayoutMode: (mode) => {
        const next = isMobileDevice() ? "fullscreen" : mode;
        applyLayoutModeAttribute(next);
        set({ layoutMode: next });
      },
      toggleLayoutMode: () => {
        if (isMobileDevice()) return;
        const next =
          get().layoutMode === "pixel-perfect" ? "fullscreen" : "pixel-perfect";
        applyLayoutModeAttribute(next);
        set({ layoutMode: next });
      },
      setFontDisplay: (font) => {
        applyFontAttributes(font, get().fontBody);
        set({ fontDisplay: font });
      },
      setFontBody: (font) => {
        applyFontAttributes(get().fontDisplay, font);
        set({ fontBody: font });
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
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as {
          fontDisplay?: unknown;
          fontBody?: unknown;
        };
        return {
          ...current,
          ...(persisted as Record<string, unknown>),
          layoutMode: resolveInitialLayoutMode(),
          fontDisplay:
            parseFontDisplay(saved.fontDisplay) ?? DEFAULT_FONT_DISPLAY,
          fontBody: parseFontBody(saved.fontBody) ?? DEFAULT_FONT_BODY,
        };
      },
    },
  ),
);
