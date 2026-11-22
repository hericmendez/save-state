"use client";

import { useEffect, useRef, useState } from "react";
import { FaBars } from "react-icons/fa";
import type { SafeUser } from "@/features/shared/types";
import { Content } from "./content";
import { LoadingOverlay } from "./loading-overlay";
import { NavDesktop } from "./nav-desktop";
import { NavMobile } from "./nav-mobile";
import { useResponsiveLayout } from "./use-responsive-layout";
import { CollectionCreateModal } from "@/features/collections/collection-create-modal";

export function AppShell({
  user,
  children,
}: {
  user: SafeUser;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopNavigationRef = useRef<HTMLSpanElement>(null);
  const wasSidebarOpen = useRef(false);

  useResponsiveLayout();

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  useEffect(() => {
    if (wasSidebarOpen.current && !sidebarOpen) {
      if (window.innerWidth < 768) {
        menuTriggerRef.current?.focus();
      } else {
        desktopNavigationRef.current?.querySelector<HTMLElement>("nav a[href]")?.focus();
      }
    }
    wasSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    const closeDrawerOnDesktop = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    window.addEventListener("resize", closeDrawerOnDesktop);
    return () => window.removeEventListener("resize", closeDrawerOnDesktop);
  }, []);

  return (
    <main
      className={`
        flex
        flex-col
        md:flex-row
        w-full
        m-auto
        layout-shell
      `}
    >
      <LoadingOverlay />
      <CollectionCreateModal />

      <div
        className={`
          flex
          flex-row
          w-full
          overflow-hidden
          layout-shell-inner
        `}
      >
        <span ref={desktopNavigationRef} className="hidden md:contents">
          <NavDesktop user={user} />
        </span>
        <span className="contents md:hidden">
          <NavMobile
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            user={user}
          />
        </span>

        <Content>
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={toggleSidebar}
            aria-label="Abrir menu de navegação"
            aria-expanded={sidebarOpen}
            aria-controls="mobile-navigation"
            className="rpgui-button ss-rpgui-button--icon ss-rpgui-button--compact !fixed left-3 top-3 z-30 md:!hidden"
          >
            <FaBars aria-hidden="true" />
          </button>

          <div className="ss-shell-mobile-content">{children}</div>
        </Content>
      </div>
    </main>
  );
}
