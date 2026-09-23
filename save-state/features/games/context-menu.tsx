"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeMenu, placeSubmenu } from "./menu-position";
import RPGUIButton from "@/components/RPGUI/Button";

export interface ContextMenuItem {
  key: string;
  label?: string;
  separator?: boolean;
  onClick?: () => void;
  children?: ContextMenuItem[];
  disabled?: boolean;
}

function SubmenuFloat({
  parent,
  items,
  onClose,
}: {
  parent: HTMLElement | null;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{
    left: number;
    top: number;
    visibility?: "hidden";
  }>({ left: 0, top: 0, visibility: "hidden" });

  useEffect(() => {
    if (!parent || !ref.current) return;
    const parentRect = parent.getBoundingClientRect();
    const rect = ref.current.getBoundingClientRect();
    const placed = placeSubmenu({
      parentLeft: parentRect.left,
      parentTop: parentRect.top,
      parentWidth: parentRect.width,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setStyle((current) =>
      current.left === placed.x &&
      current.top === placed.y &&
      current.visibility === undefined
        ? current
        : { left: placed.x, top: placed.y },
    );
  }, [parent, items]);

  return (
    <div ref={ref} className="absolute z-10" style={style}>
      <MenuList items={items} onClose={onClose} />
    </div>
  );
}

function MenuItemRow({
  item,
  open,
  onOpen,
  onCloseSub,
  onToggle,
  onClose,
}: {
  item: ContextMenuItem;
  open: boolean;
  onOpen: () => void;
  onCloseSub: () => void;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [liElement, setLiElement] = useState<HTMLLIElement | null>(null);
  return (
    <li
      ref={setLiElement}
      className="relative"
      onMouseEnter={() => {
        if (item.children) onOpen();
      }}
      onMouseLeave={() => {
        if (item.children) onCloseSub();
      }}
    >
      <RPGUIButton
        type="button"
        title={item.label}
        className="w-full text-left"
        disabled={item.disabled}
        aria-disabled={item.disabled}
        onClick={() => {
          if (item.disabled) return;
          if (item.children) {
            onToggle();
            return;
          }
          item.onClick?.();
          onClose();
        }}
      >
        {item.children ? " ▶" : ""}
      </RPGUIButton>
      {item.children && open && (
        <SubmenuFloat parent={liElement} items={item.children} onClose={onClose} />
      )}
    </li>
  );
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
          <MenuItemRow
            key={item.key}
            item={item}
            open={openKey === item.key}
            onOpen={() => setOpenKey(item.key)}
            onCloseSub={() => setOpenKey(null)}
            onToggle={() =>
              setOpenKey((current) => (current === item.key ? null : item.key))
            }
            onClose={onClose}
          />
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
  // Anchor (viewport coords, where the user invoked the menu) is the stable
  // input; the placed position is derived by measuring the rendered menu.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  function computePlacement(ax: number, ay: number) {
    const element = menuRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return placeMenu({
      anchorX: ax,
      anchorY: ay,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
  }

  function applyPlacement(next: { x: number; y: number } | null) {
    if (!next) {
      setPosition(null);
      return;
    }
    setPosition((current) =>
      current && current.x === next.x && current.y === next.y
        ? current
        : next,
    );
  }

  useEffect(() => {
    if (!anchor) {
      setPosition(null);
      return;
    }
    const anchorX = anchor.x;
    const anchorY = anchor.y;
    // Measure after paint (menu content such as Favoritar/Desfavoritar
    // labels can resize it) and place inside the viewport.
    applyPlacement(computePlacement(anchorX, anchorY));
  }, [anchor, items]);

  useEffect(() => {
    if (!anchor) return;
    function close(event?: Event) {
      // Clicks inside the menu itself (e.g. toggling a submenu) must not
      // close it; only outside interactions and Escape do.
      if (
        event instanceof MouseEvent &&
        menuRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setAnchor(null);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    // Resize/orientation closes the menu: the root could be recalculated
    // from its anchor, but open submenus are measured once and would be
    // left stranded, so a uniform close is the consistent strategy.
    // (Scroll already closes via the capture listener above.)
    function handleResize() {
      setAnchor(null);
    }
    const handleClick = (event: Event) => close(event);
    document.addEventListener("click", handleClick);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [anchor]);

  return (
    <>
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          setAnchor({ x: event.clientX, y: event.clientY });
        }}
      >
        {children}
      </div>
      {anchor &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99999]"
            style={{
              left: position?.x ?? anchor.x,
              top: position?.y ?? anchor.y,
              visibility: position ? "visible" : "hidden",
            }}
          >
            <MenuList items={items} onClose={() => setAnchor(null)} />
          </div>,
          document.body,
        )}
    </>
  );
}
