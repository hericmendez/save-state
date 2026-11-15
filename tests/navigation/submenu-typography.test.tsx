/**
 * Regressão RC03.1 — tipografia dos submenus após o merge de reconciliação.
 *
 * A melhoria de UX aprovada removeu `font-display` dos botões/links
 * internos dos submenus (fonte padrão de textos; a fonte de títulos fica
 * restrita a títulos e ao skin `.rpgui-button` dos abridores de grupo).
 * O merge RC03 restaurou a classe em dois rótulos de `nav-item.tsx`.
 *
 * Estes testes montam os componentes reais em jsdom e verificam o DOM
 * renderizado — não apenas o texto-fonte — para que a classe não volte
 * silenciosamente. Também garantem que a quebra de nomes de coleção
 * (`overflow-wrap:anywhere` + `<wbr>` após `_`) continua intacta.
 */

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { MouseEventHandler, ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/catalogo/filho",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    onClick,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={typeof href === "string" ? href : "#"}
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  ),
}));

import { CollectionNavItems } from "@/features/navigation/collection-nav-items";
import { NavItem } from "@/features/navigation/nav-item";

const SUBMENU_LABEL_CLASSES = [
  "text-lg",
  "text-white",
  "text-bold",
  "hover:text-amber-300",
  "hover:text-underline",
];

beforeEach(() => {
  // Plain response stub (no global `Response` dependency in jsdom).
  // `pagination` mirrors the real index contract: `apiRequest` returns the
  // whole payload for paginated responses, so `result.data` is the array.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ _id: "c1", name: "Minha_Coleção", gameCount: 2 }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("submenu typography", () => {
  const groupEntry = {
    id: "grupo-rc031",
    title: "Grupo de teste",
    children: [
      { id: "filho-link", title: "Filho link", path: "/catalogo/filho" },
      {
        id: "filho-acao",
        title: "Nova coleção",
        action: "create-collection" as const,
      },
    ],
  };

  it("renders action and link labels without the title font", () => {
    render(<NavItem entry={groupEntry} pathname="/catalogo/filho" />);

    for (const label of ["Filho link", "Nova coleção"]) {
      const element = screen.getByText(label);
      expect(element.tagName).toBe("P");
      expect(element.className).not.toContain("font-display");
      for (const className of SUBMENU_LABEL_CLASSES) {
        expect(element.className).toContain(className);
      }
    }
  });

  it("uses a larger body-font size for submenu labels", () => {
    render(<NavItem entry={groupEntry} pathname="/catalogo/filho" />);

    for (const label of ["Filho link", "Nova coleção"]) {
      const element = screen.getByText(label);
      expect(element.className).toContain("text-lg");
      // RC03.1: body text stays on the body font — never the title font.
      expect(element.className).not.toContain("font-display");
    }
  });

  it("keeps the group opener on the button skin (title font via CSS)", () => {
    render(<NavItem entry={groupEntry} pathname="/catalogo/filho" />);

    const opener = screen
      .getAllByRole("button")
      .find((element) => element.className.includes("rpgui-button"));

    expect(opener).toBeTruthy();
    expect(opener?.textContent).toContain("Grupo de teste");
    // O abridor de grupo não é um item interno de submenu: ele mantém o
    // skin `.rpgui-button`, que aplica a fonte de títulos pelo CSS.
    expect(opener?.className).not.toContain("framed-grey");
    // Legibilidade sem tirar a distinção de título/grupo.
    expect(opener?.className).toContain("!text-sm");
  });

  it("keeps collection names on the body font with underscore wrapping", async () => {
    const { container } = render(<CollectionNavItems />);

    await waitFor(() =>
      expect(
        container.querySelector('a[href="/backlog/lists/c1"]'),
      ).toBeTruthy(),
    );

    const link = container.querySelector(
      'a[href="/backlog/lists/c1"]',
    ) as HTMLAnchorElement;

    expect(link.className).not.toContain("font-display");
    expect(link.className).toContain("whitespace-normal");
    expect(link.className).toContain("[overflow-wrap:anywhere]");
    expect(link.className).toContain("text-base");
    expect(link.textContent).toBe("Minha_Coleção");
    expect(link.querySelectorAll("wbr")).toHaveLength(1);

    const options = screen.getByRole("button", {
      name: "Opções de Minha_Coleção",
    });
    expect(options.className).not.toContain("font-display");
  });
});

describe("title typography contract", () => {
  const css = readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");

  it("keeps body text on the body font", () => {
    expect(css).toMatch(
      /body \{[^}]*font-family: var\(--font-body-name\);/s,
    );
  });

  it("keeps the title font for explicit titles and button skins", () => {
    expect(css).toMatch(
      /\.font-display \{\s*font-family: var\(--font-display-name\);\s*\}/,
    );
    expect(css).toMatch(
      /\.rpgui-button \{\s*font-family: var\(--font-display-name\) !important;\s*\}/,
    );
  });
});
