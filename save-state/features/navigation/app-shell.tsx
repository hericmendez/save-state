"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useUiStore } from "@/features/shared/ui-store";
import type { SafeUser } from "@/features/shared/types";

const NAV_ITEMS = [
  { title: "Dashboard", path: "/dashboard" },
  { title: "Todos os jogos", path: "/backlog" },
  { title: "Novo jogo", path: "/backlog/new" },
  { title: "Minhas listas", path: "/backlog/lists" },
  { title: "Configurações", path: "/settings" },
];

function useSidebarKeyboard(items: { title: string; path: string }[]) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const currentIndex = items.findIndex((item) => item.path === pathname);
      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
      router.push(items[nextIndex].path);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items, pathname, router]);
}

function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      router.refresh();
      router.push("/login");
    }
  }

  return (
    <button
      className="rpgui-button"
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
    >
      {isLoading ? "Saindo…" : "Sair"}
    </button>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SafeUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const layoutMode = useUiStore((state) => state.layoutMode);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useSidebarKeyboard(NAV_ITEMS);

  return (
    <div className="flex min-h-screen">
      <button
        className="rpgui-button fixed left-2 top-2 z-50 md:hidden"
        type="button"
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label="Abrir menu"
      >
        ☰
      </button>
      <aside
        className={`rpgui-container framed-grey fixed z-40 flex h-screen w-64 flex-col gap-4 p-4 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/shotgun.png" alt="Avatar" width={48} height={48} />
          <p>{user.name}</p>
        </div>
        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`rpgui-button ${pathname === item.path ? "down" : ""}`}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <LogoutButton />
        </div>
      </aside>
      <div
        className={`content-scroll flex-1 overflow-y-auto p-4 ${
          layoutMode === "pixel-perfect" ? "pixel-frame-height" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
