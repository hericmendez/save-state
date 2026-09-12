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
  return (
    <ul className="rpgui-container framed-grey min-w-48 p-1">
      {items.map((item) =>
        item.separator ? (
          <li key={item.key} aria-hidden="true">
            <hr />
          </li>
        ) : (
          <li key={item.key} className="relative">
            <button
              className="rpgui-button w-full text-left"
              type="button"
              onClick={() => {
                item.onClick?.();
                if (!item.children) onClose();
              }}
            >
              {item.label}
              {item.children ? " ▶" : ""}
            </button>
            {item.children && (
              <div className="absolute left-full top-0 hidden hover:block group-hover:block">
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
    function close() {
      setPosition(null);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", close);
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
