"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LayoutMode = "pixel-perfect" | "fullscreen";

interface UiState {
  layoutMode: LayoutMode;
  isLoading: boolean;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleLayoutMode: () => void;
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
 */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      layoutMode: isMobileDevice() ? "fullscreen" : "pixel-perfect",
      isLoading: false,
      setLayoutMode: (mode) =>
        set({ layoutMode: isMobileDevice() ? "fullscreen" : mode }),
      toggleLayoutMode: () => {
        if (isMobileDevice()) return;
        set({
          layoutMode:
            get().layoutMode === "pixel-perfect"
              ? "fullscreen"
              : "pixel-perfect",
        });
      },
      showLoading: () => set({ isLoading: true }),
      hideLoading: () => set({ isLoading: false }),
    }),
    {
      name: "save-state-ui",
      partialize: (state) => ({ layoutMode: state.layoutMode }),
    },
  ),
);
