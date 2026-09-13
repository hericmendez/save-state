"use client";

import { useUiStore } from "@/features/shared/ui-store";

export function Content({ children }: { children: React.ReactNode }) {
  const layoutMode = useUiStore((state) => state.layoutMode);

  const isFullscreen = layoutMode === "fullscreen";

  return (
    <div
      className={`
        rpgui-container
        framed
        w-full
        !px-0
        !py-5
        overflow-y-auto
        overflow-x-hidden
        content-scroll
        z-1

        ${isFullscreen ? "h-screen" : "pixel-frame-height"}
      `}
    >
      <div
        className={`
          mb-5
          pb-25
          pt-5
          !px-0

          ${isFullscreen ? "scale-100" : ""}
        `}
        style={{
          zoom: isFullscreen ? "100%" : "80%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
