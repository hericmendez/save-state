"use client";

import Link from "next/link";
import { useState } from "react";
import { useListModalStore } from "@/features/lists/list-modal-store";
import RPGUIButton from "@/components/RPGUI/Button";
import { NAV_STRUCTURE, flattenNavPaths, type NavEntry } from "./nav-structure";

export type { NavEntry };
export { NAV_STRUCTURE, flattenNavPaths };

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
    <Link href={entry.path ?? "#"} onClick={onNavigate} className="w-full">
      <RPGUIButton
        title={entry.title}
        golden={!isChild}
        className={`w-full         
          ${isActive ? "down" : ""}
        `}
      />{" "}
    </Link>
  );
}

export function NavItem({
  entry,
  pathname,
  onNavigate,
  isChild = false,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate?: () => void;
  isChild?: boolean;
}) {
  const openListModal = useListModalStore((state) => state.open);

  if (entry.action === "create-list") {
    return (
      <RPGUIButton
        type="button"
        title={entry.title}
        golden={!isChild}
        className="w-full"
        onClick={() => {
          onNavigate?.();
          openListModal();
        }}
        
      />
    );
  }

  const hasChildren = !!entry.children?.length;

  if (!hasChildren) {
    return (
      <NavLink
        entry={entry}
        isChild={isChild}
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
      isChild={isChild}
    />
  );
}

function NavItemGroup({
  entry,
  pathname,
  onNavigate,
  hasActiveChild,
  isChild,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate?: () => void;
  hasActiveChild: boolean;
  isChild: boolean;
}) {
  const [isOpen, setIsOpen] = useState(hasActiveChild);

  return (
    <div className="w-full">
      <RPGUIButton
        type="button"
        title={entry.title}
        golden
        onClick={() => setIsOpen((previous) => !previous)}
        className={`w-full whitespace-nowrap !text-xs ${hasActiveChild ? "down" : ""}`}
        style={{ minWidth: 0, paddingLeft: "12px", paddingRight: "12px" }}
      >
        {isOpen ? "⌃" : "⌄"}
      </RPGUIButton>

      {isOpen && (
        <div className="mt-2 mx-4 space-y-2">
          {(entry.children ?? []).map((child) => (
            <NavItem
              key={child.id}
              entry={child}
              pathname={pathname}
              onNavigate={onNavigate}
              isChild
            />
          ))}
        </div>
      )}
    </div>
  );
}
