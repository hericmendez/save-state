// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("@/features/navigation/nav-desktop", () => ({
  LogoutLink: ({ onDone }: { onDone?: () => void }) => (
    <a href="#" onClick={onDone}>Sair</a>
  ),
}));
vi.mock("@/features/navigation/nav-item", () => ({
  NAV_STRUCTURE: [{ id: "home", title: "Home", path: "/home" }],
  NavItem: ({ entry, onNavigate }: {
    entry: { title: string };
    onNavigate?: () => void;
  }) => <a href="/home" onClick={onNavigate}>{entry.title}</a>,
}));

import { NavMobile } from "@/features/navigation/nav-mobile";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("mobile navigation drawer", () => {
  it("shows the user's greeting, preserves navigation, and hides when closed", () => {
    const { rerender } = render(
      <NavMobile isOpen onClose={vi.fn()} user={{ id: "u1", name: "A Player", email: "a@example.com" }} />,
    );
    expect(screen.getByText("Bem-vindo, A Player!")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sair" })).toBeTruthy();

    rerender(
      <NavMobile isOpen={false} onClose={vi.fn()} user={{ id: "u1", name: "A Player", email: "a@example.com" }} />,
    );
    expect(screen.getByRole("dialog", { hidden: true }).hasAttribute("inert")).toBe(true);
  });

  it("closes on Escape and traps forward and reverse Tab focus", () => {
    const onClose = vi.fn();
    render(
      <NavMobile isOpen onClose={onClose} user={{ id: "u1", name: "Player", email: "a@example.com" }} />,
    );
    const drawer = screen.getByRole("dialog");
    const focusables = drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes from the backdrop and restores body scrolling on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <NavMobile isOpen onClose={onClose} user={{ id: "u1", name: "Player", email: "a@example.com" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar menu de navegação" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
