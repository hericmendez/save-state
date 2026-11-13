"use client";

import LoadingScreen from "@/components/RPGUI/LoadingScreen";
import { useUiStore } from "@/features/shared/ui-store";

export function LoadingOverlay() {
  const isLoading = useUiStore((state) => state.isLoading);

  if (!isLoading) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80">
      <LoadingScreen />
    </div>
  );
}
