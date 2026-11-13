"use client";

import { useEffect } from "react";
import { useUiStore } from "@/features/shared/ui-store";

/**
 * Forces fullscreen layout mode on narrow viewports, mirroring the legacy
 * responsive behavior. Never restores the previous mode on grow-back.
 */
export function useResponsiveLayout() {
  const setLayoutMode = useUiStore((state) => state.setLayoutMode);

  useEffect(() => {
    const apply = () => {
      if (window.innerWidth < 768) {
        setLayoutMode("fullscreen");
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [setLayoutMode]);
}
