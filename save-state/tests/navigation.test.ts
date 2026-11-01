import { readFileSync } from "fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NAV_STRUCTURE,
  flattenNavPaths,
} from "@/features/navigation/nav-structure";

/**
 * Etapa 5 — navigation contract.
 *
 * Justification for rewriting the stale expectations: the approved
 * Etapa 5 spec renames Diário→Atividade, removes Famílias/Consoles
 * from the menu (filter lives in Busca Geral), and visually renames
 * Minhas Listas→Minhas coleções. The old assertions (Famílias,
 * Consoles (gerações), Minha Biblioteca, Minhas Listas labels) encode
 * the pre-Etapa-5 menu and were already failing on the current tree.
 */
describe("navigation structure (Etapa 5)", () => {
  it("routes Home and Dashboard to distinct pages", () => {
    const home = NAV_STRUCTURE.find((entry) => entry.id === "home");
    const dashboard = NAV_STRUCTURE.find((entry) => entry.id === "dashboard");
    const atividade = NAV_STRUCTURE.find((entry) => entry.id === "atividade");
    expect(home?.path).toBe("/home");
    expect(dashboard?.path).toBe("/dashboard");
    expect(atividade?.path).toBe("/diary");
    expect(home?.path).not.toBe(dashboard?.path);
  });

  it("labels the diary entry as Atividade while preserving the route", () => {
    const atividade = NAV_STRUCTURE.find((entry) => entry.id === "atividade");
    expect(atividade?.title).toBe("Atividade");
    expect(atividade?.path).toBe("/diary");
    const titles = NAV_STRUCTURE.map((entry) => entry.title);
    expect(titles).not.toContain("Diário");
  });

  it("includes both routes in keyboard navigation paths", () => {
    const paths = flattenNavPaths(NAV_STRUCTURE);
    expect(paths).toContain("/home");
    expect(paths).toContain("/dashboard");
    expect(paths).toContain("/diary");
  });

  it("keeps Buscar Jogos to Geral + Plataformas (filters replace the items)", () => {
    const buscar = NAV_STRUCTURE.find((entry) => entry.id === "buscar-jogos");
    const childIds = (buscar?.children ?? []).map((entry) => entry.id);
    expect(childIds).toEqual(["busca-geral", "plataformas"]);
    const titles = (buscar?.children ?? []).map((entry) => entry.title);
    expect(titles).not.toContain("Famílias");
    expect(titles).not.toContain("Consoles (gerações)");
  });

  it("keeps the removed catalog routes reachable (menu-only removal)", () => {
    for (const routeFile of [
      "app/(app)/catalog/families/page.tsx",
      "app/(app)/catalog/families/[familyId]/page.tsx",
      "app/(app)/catalog/consoles/page.tsx",
      "app/(app)/catalog/consoles/[generationId]/page.tsx",
    ]) {
      const content = readFileSync(path.resolve(routeFile), "utf8");
      expect(content).toContain("export default");
    }
  });

  it("exposes Minhas coleções with creation, index and sem-coleção entries", () => {
    const colecoes = NAV_STRUCTURE.find((entry) => entry.id === "colecoes");
    expect(colecoes?.title).toBe("Minhas coleções");
    expect(colecoes?.path).toBeUndefined();
    const children = colecoes?.children ?? [];
    const byId = new Map(children.map((entry) => [entry.id, entry]));
    expect(byId.get("new-collection")).toMatchObject({
      title: "Nova Coleção",
      action: "create-collection",
    });
    expect(byId.get("new-collection")?.path).toBeUndefined();
    expect(byId.get("all-collections")).toMatchObject({
      title: "Todas as coleções",
      path: "/backlog/lists",
    });
    expect(byId.get("sem-colecao")).toMatchObject({
      title: "Jogos sem coleção",
      path: "/backlog/without-list",
    });
    expect(
      children.some((entry) => entry.title === "Listas Personalizadas"),
    ).toBe(false);
  });

  it("keeps Minhas Listas out of the menu (visual rename complete)", () => {
    const titles: string[] = [];
    const collect = (entries: typeof NAV_STRUCTURE): void => {
      for (const entry of entries) {
        titles.push(entry.title);
        if (entry.children) collect(entry.children);
      }
    };
    collect(NAV_STRUCTURE);
    expect(titles).not.toContain("Minhas Listas");
    expect(titles).not.toContain("Nova Lista");
    expect(titles).not.toContain("Listas Personalizadas");
    expect(titles).not.toContain("Jogos sem lista");
  });

  it("keeps untouched entries stable", () => {
    const byId = new Map(NAV_STRUCTURE.map((entry) => [entry.id, entry]));
    expect(byId.get("home")?.path).toBe("/home");
    expect(byId.get("dashboard")?.path).toBe("/dashboard");
    expect(byId.get("top10")).toMatchObject({
      title: "Meu Top 10",
      path: "/backlog/top10",
    });
    expect(byId.get("settings")?.path).toBe("/settings");
    const biblioteca = byId.get("biblioteca");
    expect(biblioteca?.title).toBe("Meu Backlog");
    expect(
      (biblioteca?.children ?? []).map((entry) => entry.id),
    ).toEqual(["new-game", "jogos", "favoritos"]);
  });

  it("uses English canonical routes (Portuguese URLs redirect)", () => {
    const paths = flattenNavPaths(NAV_STRUCTURE);
    for (const route of [
      "/home",
      "/dashboard",
      "/catalog",
      "/catalog/platforms",
      "/backlog",
      "/backlog/new",
      "/backlog/favoritos",
      "/backlog/top10",
      "/backlog/lists",
      "/backlog/without-list",
      "/settings",
    ]) {
      expect(paths).toContain(route);
    }
    for (const legacy of [
      "/catalog/plataformas",
      "/catalog/familias",
      "/backlog/sem-lista",
    ]) {
      expect(paths).not.toContain(legacy);
    }
  });

  it("redirects legacy Portuguese URLs to the English canonical routes", async () => {
    const config = (await import("../next.config")).default;
    const redirects =
      typeof config.redirects === "function" ? await config.redirects() : [];
    const sources = redirects.map((r) => r.source);
    expect(sources).toContain("/catalog/plataformas/:path*");
    expect(sources).toContain("/catalog/familias/:path*");
    expect(sources).toContain("/backlog/sem-lista/:path*");
    for (const redirect of redirects) {
      expect(redirect.permanent).toBe(false);
    }
  });
});

describe("creation modal dispatch contract", () => {
  it("exposes the creation entry as action-only (no dead link target)", () => {
    const colecoes = NAV_STRUCTURE.find((entry) => entry.id === "colecoes");
    const creation = (colecoes?.children ?? []).find(
      (entry) => entry.action === "create-collection",
    );
    expect(creation).toBeDefined();
    expect(creation?.path).toBeUndefined();
  });

  it("preserves the manual submenu buttons and dispatches actions (no ignored child.action)", () => {
    // Same source-content style as the repo's loading-ux/modal tests:
    // the regression was NavItemGroup ignoring child.action. The manual
    // <Link><li><p> submenu buttons are preserved verbatim; action
    // children keep the same look but open the modal via openListModal.
    const source = readFileSync(
      path.resolve("features/navigation/nav-item.tsx"),
      "utf8",
    );
    const groupBody = source.slice(source.indexOf("function NavItemGroup"));
    expect(groupBody).toContain('href={child.path ?? "#"}');
    expect(groupBody).toContain("child.action");
    expect(groupBody).toContain("openCollectionModal");
  });
});
