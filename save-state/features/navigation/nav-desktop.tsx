"use client";

import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useUiStore } from "@/features/shared/ui-store";
import type { SafeUser } from "@/features/shared/types";
import { NAV_STRUCTURE, NavItem, flattenNavPaths } from "./nav-item";
import { useEffect, useState } from "react";

function useSidebarKeyboard(paths: string[]) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const currentIndex = paths.findIndex((path) => path === pathname);
      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % paths.length
          : (currentIndex - 1 + paths.length) % paths.length;
      router.push(paths[nextIndex]);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paths, pathname, router]);
}

const ALL_NAV_PATHS = flattenNavPaths(NAV_STRUCTURE);

function LogoutLink({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout(
    event: React.MouseEvent<HTMLAnchorElement>,
  ) {
    event.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      onDone?.();
      router.refresh();
      router.push("/login");
    }
  }

  return (
    <a
      className="text-sm!"
      href="#"
      onClick={handleLogout}
      aria-busy={isLoading}
    >
      (Logout)
    </a>
  );
}

export function NavDesktop({ user }: { user: SafeUser }) {
  const pathname = usePathname();
  const layoutMode = useUiStore((state) => state.layoutMode);
  const isFullscreen = layoutMode === "fullscreen";

  useSidebarKeyboard(ALL_NAV_PATHS);

  return (
    <aside
      className={`
        rpgui-container
        framed
        fixed
        md:relative
        pt-5
        w-100
        p-5
        transition-transform
        duration-300
        md:translate-x-0
        overflow-y-auto

        ${isFullscreen ? "h-screen" : "pixel-frame-height"}
      `}
    >
      {/* PROFILE */}
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/shotgun.png" alt="Profile" className="w-24 h-24 p-0" />

        <h2 className="text-xl !mb-0 press-start-2p-regular">Save State</h2>
        <p className="text-sm!">
          Bem-vindo, {user?.name || "Player One"}!
        </p>
        <LogoutLink />
      </div>

      <hr className="golden my-3" />

      {/* NAVIGATION */}
      <nav style={{ zoom: "80%" }} className="space-y-2">
        {NAV_STRUCTURE.map((item) => (
          <NavItem key={item.id} entry={item} pathname={pathname} />
        ))}
      </nav>

      {/* KEYBOARD HINT */}
      <p className="absolute bottom-0 !text-slate-200 !text-sm !text-center">
        Pressione ⬆️ e ⬇️ no teclado para navegar!
      </p>
    </aside>
  );
}
