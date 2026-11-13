"use client";

import Link from "next/link";
import { useState } from "react";
import { useCollectionModalStore } from "@/features/collections/collection-modal-store";
import RPGUIButton from "@/components/RPGUI/Button";
import { NAV_STRUCTURE, flattenNavPaths, type NavEntry } from "./nav-structure";
import { CollectionNavItems } from "./collection-nav-items";

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
  const openCollectionModal = useCollectionModalStore((state) => state.open);

  if (entry.action === "create-collection") {
    return (
      <RPGUIButton
        type="button"
        title={entry.title}
        golden={!isChild}
        className="w-full"
        onClick={() => {
          onNavigate?.();
          openCollectionModal();
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
  const openCollectionModal = useCollectionModalStore((state) => state.open);

  return (
    <div className="w-full">
      <RPGUIButton
        type="button"
        title={entry.title}
        
        onClick={() => setIsOpen((previous) => !previous)}
        className={`w-full whitespace-nowrap !text-xs ${hasActiveChild ? "down" : ""}`}
        style={{ minWidth: 0, paddingLeft: "12px", paddingRight: "12px" }}
      >
        {isOpen ? "⌃" : "⌄"}
      </RPGUIButton>

      {isOpen && (
        <div className="mt-2 mx-4 space-y-2">
          <ul >
            {(entry.children ?? []).map((child) =>
              // Action children (e.g. Nova Coleção) keep the original
              // framed-grey look but dispatch the modal instead of
              // navigating. Both variants render through RpguiButton.
              child.action === "create-collection" ? (
                <li key={child.id}>
                  <RPGUIButton
                    type="button"
                    framed="grey"
                    className="block w-full text-lg text-white text-bold"
                    onClick={() => {
                      onNavigate?.();
                      openCollectionModal();
                    }}
                    title={
                      <p className="text-sm text-white text-bold font-display hover:text-amber-300 hover:text-underline">
                        {child.title}
                      </p>
                    }
                  />
                </li>
              ) : (
                <li key={child.id}>
                  <RPGUIButton
                    as="link"
                    framed="grey"
                    className="block w-full text-lg text-white text-bold"
                    href={child.path ?? "#"}
                    onClick={onNavigate}
                    title={
                      <p className="text-sm text-white text-bold font-display hover:text-amber-300 hover:text-underline">
                        {child.title}
                      </p>
                    }
                  />
                </li>
              ),
            )}
          </ul>
          {entry.id === "colecoes" ? (
            <CollectionNavItems onNavigate={onNavigate} />
          ) : null}
        </div>
      )}
    </div>
  );
}
