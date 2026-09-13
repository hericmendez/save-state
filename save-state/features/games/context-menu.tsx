"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  key: string;
  label?: string;
  separator?: boolean;
  onClick?: () => void;
  children?: ContextMenuItem[];
}

function MenuList({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }) {
  // Submenu visibility is driven by React state (hover + tap-to-toggle),
  // not by CSS :hover. This works on touch devices and in environments
  // without hover-capable pointers, where Tailwind v4 gates hover variants
  // behind @media (hover:hover) and CSS-only submenus can never appear.
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <ul className="rpgui-container framed-grey min-w-48 p-1">
      {items.map((item) =>
        item.separator ? (
          <li key={item.key} aria-hidden="true">
            <hr />
          </li>
        ) : (
          <li
            key={item.key}
            className="relative"
            onMouseEnter={() => {
              if (item.children) setOpenKey(item.key);
            }}
            onMouseLeave={() => {
              if (item.children) setOpenKey(null);
            }}
          >
            <button
              className="rpgui-button w-full text-left"
              type="button"
              onClick={() => {
                if (item.children) {
                  setOpenKey((current) =>
                    current === item.key ? null : item.key,
                  );
                  return;
                }
                item.onClick?.();
                onClose();
              }}
            >
              {item.label}
              {item.children ? " ▶" : ""}
            </button>
            {item.children && openKey === item.key && (
              <div className="absolute left-full top-0 z-10 max-md:left-0 max-md:top-full">
                <MenuList items={item.children} onClose={onClose} />
              </div>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

export function CustomContextMenu({
  items,
  children,
}: {
  items: ContextMenuItem[];
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    function close(event?: Event) {
      // Clicks inside the menu itself (e.g. toggling a submenu) must not
      // close it; only outside interactions and Escape do.
      if (
        event instanceof MouseEvent &&
        menuRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setPosition(null);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    const handleClick = (event: Event) => close(event);
    document.addEventListener("click", handleClick);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [position]);

  useEffect(() => {
    if (!position || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.min(position.x, window.innerWidth - rect.width - 8);
    const y = Math.min(position.y, window.innerHeight - rect.height - 8);
    if (x !== position.x || y !== position.y) {
      setPosition({ x: Math.max(0, x), y: Math.max(0, y) });
    }
  }, [position]);

  return (
    <>
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          setPosition({ x: event.clientX, y: event.clientY });
        }}
      >
        {children}
      </div>
      {position &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99999]"
            style={{ left: position.x, top: position.y }}
          >
            <MenuList items={items} onClose={() => setPosition(null)} />
          </div>,
          document.body,
        )}
    </>
  );
}
