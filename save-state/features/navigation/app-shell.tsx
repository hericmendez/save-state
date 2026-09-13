"use client";

import { useState } from "react";
import { FaBars } from "react-icons/fa";
import { useUiStore } from "@/features/shared/ui-store";
import type { SafeUser } from "@/features/shared/types";
import { Content } from "./content";
import { LoadingOverlay } from "./loading-overlay";
import { NavDesktop } from "./nav-desktop";
import { NavMobile } from "./nav-mobile";
import { useResponsiveLayout } from "./use-responsive-layout";

export function AppShell({
  user,
  children,
}: {
  user: SafeUser;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const layoutMode = useUiStore((state) => state.layoutMode);
  useResponsiveLayout();

  const isFullscreen = layoutMode === "fullscreen";

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  return (
    <main
      className={`
        flex
        flex-col
        md:flex-row
        w-full
        min-h-screen
        m-auto

        ${
          isFullscreen
            ? "max-w-none md:aspect-auto"
            : "max-w-[133.33vh] md:aspect-[4/3]"
        }
      `}
    >
      <LoadingOverlay />

      <div
        className={`
          flex
          flex-row
          w-full
          overflow-hidden

          ${isFullscreen ? "min-h-screen" : ""}
        `}
      >
        <span className="hidden md:contents">
          <NavDesktop user={user} />
        </span>
        <span className="contents md:hidden">
          <NavMobile isOpen={sidebarOpen} toggleSidebar={toggleSidebar} />
        </span>

        <Content>
          <div
            onClick={toggleSidebar}
            className="
              !fixed
              flex
              justify-center
              items-center
              rpgui-container
              framed-golden
              h-12
              w-12
              opacity-75
              hover:opacity-100
              top-5
              left-5
              z-[999]
              md:hidden
            "
          >
            <span className="flex justify-center items-center !text-amber-300">
              <FaBars />
            </span>
          </div>

          {children}
        </Content>
      </div>
    </main>
  );
}
