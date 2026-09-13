"use client";

import { usePathname } from "next/navigation";
import { GiCancel } from "react-icons/gi";
import { NAV_STRUCTURE, NavItem } from "./nav-item";

type NavMobileProps = {
  isOpen: boolean;
  toggleSidebar: () => void;
};

export function NavMobile({ isOpen, toggleSidebar }: NavMobileProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`
        rpgui-container
        framed-golden
        !fixed
        md:relative
        pt-5
        w-[75vw]
        p-5
        transition-transform
        duration-300
        z-20
        h-screen
        ${
          isOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }
        md:translate-x-0
      `}
    >
      {/* CLOSE BUTTON */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Fechar menu"
        className="
          rpgui-container
          framed-grey
          top-0
          right-0
          !fixed
          !h-12
          !w-12
          text-2xl
        "
      >
        <span>
          <GiCancel />
        </span>
      </button>

      <div className="h-full overflow-y-scroll z-30">
        {/* PROFILE */}
        <div className="flex flex-col items-center mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/revi_machinga.png"
            alt="Profile"
            className="
              w-36
              h-36
              rpgui-container
              framed-grey
              p-0
            "
          />

          <h4 className="text-gray-300">Héric Mendes</h4>
        </div>

        {/* NAVIGATION */}
        <nav style={{ zoom: "80%" }} className="space-y-4">
          {NAV_STRUCTURE.map((item) => (
            <NavItem
              key={item.id}
              entry={item}
              pathname={pathname}
              onNavigate={toggleSidebar}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
