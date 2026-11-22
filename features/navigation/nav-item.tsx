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
  mobile,
}: {
  entry: NavEntry;
  isChild?: boolean;
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const isActive = entry.path === pathname;

  if (mobile) {
    return (
      <RPGUIButton
        as="link"
        href={entry.path ?? "#"}
        title={entry.title}
        size="compact"
        golden
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={`ss-mobile-nav__primary w-full ${isActive ? "down" : ""}`}
      />
    );
  }

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
  mobile = false,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate?: () => void;
  isChild?: boolean;
  mobile?: boolean;
}) {
  const openCollectionModal = useCollectionModalStore((state) => state.open);

  if (entry.action === "create-collection") {
    return (
      <RPGUIButton
        type="button"
        title={entry.title}
        golden={!isChild}
        size={mobile ? "compact" : "default"}
        className={`${mobile ? "ss-mobile-nav__primary" : "w-full"} w-full`}
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
        mobile={mobile}
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
      mobile={mobile}
    />
  );
}

function NavItemGroup({
  entry,

  pathname,
  onNavigate,
  hasActiveChild,
  isChild,
  mobile,
}: {
  entry: NavEntry;
  pathname: string;
  onNavigate?: () => void;
  hasActiveChild: boolean;
  isChild: boolean;
  mobile: boolean;
}) {
  const [isOpen, setIsOpen] = useState(hasActiveChild);
  const openCollectionModal = useCollectionModalStore((state) => state.open);

  return (
    <div className="w-full">
      <RPGUIButton
        type="button"
        title={entry.title}
        size={mobile ? "compact" : "default"}
        golden={mobile}
        onClick={() => setIsOpen((previous) => !previous)}
        className={`${mobile ? "ss-mobile-nav__primary" : "w-full whitespace-nowrap !text-sm"} w-full ${hasActiveChild ? "down" : ""}`}
        style={{ minWidth: 0, paddingLeft: "12px", paddingRight: "12px" }}
      >
        {isOpen ? "⌃" : "⌄"}
      </RPGUIButton>

      {isOpen && (
        <div className={mobile ? "ss-mobile-nav__submenu" : "mt-2 mx-4 space-y-2"}>
          <ul className={mobile ? "ss-mobile-nav__sublist" : ""}>
            {(entry.children ?? []).map((child) =>
              // Action children (e.g. Nova Coleção) keep the original
              // framed-grey look but dispatch the modal instead of
              // navigating. Both variants render through RpguiButton.
              child.action === "create-collection" ? (
                <li key={child.id}>
                  {mobile ? (
                    <button
                      type="button"
                      className="ss-mobile-nav__subitem"
                      onClick={() => {
                        onNavigate?.();
                        openCollectionModal();
                      }}
                    >
                      {child.title}
                    </button>
                  ) : (
                  <RPGUIButton
                    type="button"
                    framed="grey"
                    className="block w-full text-lg text-white text-bold"
                    onClick={() => {
                      onNavigate?.();
                      openCollectionModal();
                    }}
                    title={
                      <p className="text-lg text-white text-bold hover:text-amber-300 hover:text-underline">
                        {child.title}
                      </p>
                    }
                  />
                  )}
                </li>
              ) : (
                <li key={child.id}>
                  {mobile ? (
                    <Link
                      href={child.path ?? "#"}
                      onClick={onNavigate}
                      className="ss-mobile-nav__subitem"
                      aria-current={child.path === pathname ? "page" : undefined}
                    >
                      {child.title}
                    </Link>
                  ) : <RPGUIButton
                    as="link"
                    framed="grey"
                    className="block w-full text-lg text-white text-bold"
                    href={child.path ?? "#"}
                    onClick={onNavigate}
                    title={
                      <p className="text-lg text-white text-bold hover:text-amber-300 hover:text-underline">
                        {child.title}
                      </p>
                    }
                  />}
                </li>
              ),
            )}
          </ul>
          {entry.id === "colecoes" ? (
            <CollectionNavItems onNavigate={mobile ? onNavigate : undefined} />
          ) : null}
        </div>
      )}
    </div>
  );
}
