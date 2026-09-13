"use client";

import { useUiStore } from "@/features/shared/ui-store";

export function LoadingOverlay() {
  const isLoading = useUiStore((state) => state.isLoading);

  if (!isLoading) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80">
      <span className="text-2xl font-bold text-white">Loading...</span>
    </div>
  );
}
