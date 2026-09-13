"use client";

import Link from "next/link";
import { useState } from "react";

export interface NavEntry {
  id: string;
  title: string;
  path?: string;
  children?: NavEntry[];
}

export const NAV_STRUCTURE: NavEntry[] = [
  { id: "dashboard", title: "Dashboard", path: "/dashboard" },
  {
    id: "games",
    title: "Meus jogos",
    children: [
      { id: "all-games", title: "Todos os jogos", path: "/backlog" },
      { id: "catalog", title: "Catálogo", path: "/catalog" },
      { id: "new-game", title: "Novo jogo", path: "/backlog/new" },
    ],
  },
  { id: "lists", title: "Minhas listas", path: "/backlog/lists" },
  { id: "settings", title: "Configurações", path: "/settings" },
];

export function flattenNavPaths(entries: NavEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.path) paths.push(entry.path);
    if (entry.children) paths.push(...flattenNavPaths(entry.children));
  }
  return paths;
}

function NavLink({
  entry,
  isChild,
  pathname,
  onNavigate,
}: {
  entry: NavEntry;
  isChild?: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = entry.path === pathname;
  return (
    <Link
      href={entry.path ?? "#"}
      onClick={onNavigate}
      className={`
        rpgui-button ${isChild ? "!h-[50px] golden mx-4 text-sm md:text-lg" : ""}

        w-full
        text-lg
        md:text-2xl
        flex
        items-center
        justify-center

        transition
        duration-300
        ease-in-out
        ${isActive ? "down" : ""}
      `}
    >
      <span>
        <strong>{entry.title}</strong>
      </span>
    </Link>
  );
}

export function NavItem({
  entry,
  pathname,
  onNavigate,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate?: () => void;
}) {
  const hasChildren = !!entry.children?.length;

  if (!hasChildren) {
    return (
      <NavLink
        entry={entry}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    );
  }

  const hasActiveChild = entry.children?.some(
    (child) => child.path === pathname,
  );

  return (
    <NavItemGroup
      entry={entry}
      pathname={pathname}
      onNavigate={onNavigate}
      hasActiveChild={!!hasActiveChild}
    />
  );
}

function NavItemGroup({
  entry,
  pathname,
  onNavigate,
  hasActiveChild,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate?: () => void;
  hasActiveChild: boolean;
}) {
  const [isOpen, setIsOpen] = useState(hasActiveChild);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className={`
          rpgui-button

          w-full
          text-lg
          md:text-2xl
          flex
          items-center
          justify-center

          transition
          duration-300
          ease-in-out
          ${hasActiveChild ? "down" : ""}
        `}
      >
        <span>
          <strong>{entry.title}</strong>
        </span>

        <span className="ml-3">{isOpen ? "⌃" : "⌄"}</span>
      </button>

      {isOpen && (
        <div className="mt-2 mx-4 space-y-2">
          {(entry.children ?? []).map((child) => (
            <NavLink
              key={child.id}
              entry={child}
              isChild
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
