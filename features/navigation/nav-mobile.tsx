"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { GiCancel } from "react-icons/gi";
import type { SafeUser } from "@/features/shared/types";
import { LogoutLink } from "./nav-desktop";
import { NAV_STRUCTURE, NavItem } from "./nav-item";

type NavMobileProps = {
  isOpen: boolean;
  onClose: () => void;
  user: SafeUser;
};

export function NavMobile({ isOpen, onClose, user }: NavMobileProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer?.querySelector<HTMLElement>("button, a, input, [tabindex]:not([tabindex='-1'])")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => !element.hasAttribute("aria-hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu de navegação"
        tabIndex={isOpen ? 0 : -1}
        aria-hidden={!isOpen}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/70 transition-opacity duration-200 motion-reduce:transition-none md:!hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        id="mobile-navigation"
        ref={drawerRef}
        role="dialog"
        aria-modal={isOpen ? true : undefined}
        aria-label="Navegação principal"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`ss-mobile-nav rpgui-container framed-grey ss-surface--framed-grey !fixed inset-y-0 left-0 z-50 box-border flex w-[min(86vw,22rem)] flex-col !overflow-hidden !bg-[#15171a] p-0 transition-transform duration-200 md:!hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } motion-reduce:transition-none`}
      >
        <header className="ss-mobile-nav__close-row">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="rpgui-button ss-rpgui-button--icon ss-rpgui-button--compact"
          >
            <GiCancel aria-hidden="true" />
          </button>
        </header>

        <div className="ss-mobile-nav__scroll">
          <div className="ss-mobile-nav__identity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/shotgun2.png" alt="" className="ss-mobile-nav__avatar" />
            <div className="ss-mobile-nav__identity-copy">
              <h2 className="ss-mobile-nav__brand">Save State</h2>
              <div className="ss-mobile-nav__profile">
                <p className="ss-mobile-nav__greeting">
                  Bem-vindo, {user.name || "Player One"}!
                </p>
                <LogoutLink onDone={onClose} mobile />
              </div>
            </div>
          </div>

          <nav aria-label="Navegação principal" className="ss-mobile-nav__items">
            {NAV_STRUCTURE.map((item) => (
              <NavItem
                key={item.id}
                entry={item}
                pathname={pathname}
                onNavigate={onClose}
                mobile
              />
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
