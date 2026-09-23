import { describe, expect, it } from "vitest";
import {
  NAV_STRUCTURE,
  flattenNavPaths,
} from "@/features/navigation/nav-structure";

describe("navigation structure", () => {
  it("routes Home and Dashboard to distinct pages", () => {
    const home = NAV_STRUCTURE.find((entry) => entry.id === "home");
    const dashboard = NAV_STRUCTURE.find((entry) => entry.id === "dashboard");
    const diario = NAV_STRUCTURE.find((entry) => entry.id === "diario");
    expect(home?.path).toBe("/home");
    expect(dashboard?.path).toBe("/dashboard");
    expect(diario?.path).toBe("/diary");
    expect(home?.path).not.toBe(dashboard?.path);
  });

  it("includes both routes in keyboard navigation paths", () => {
    const paths = flattenNavPaths(NAV_STRUCTURE);
    expect(paths).toContain("/home");
    expect(paths).toContain("/dashboard");
    expect(paths).toContain("/diary");
  });

  it("uses the approved Fase 1 labels (decoupled from URLs)", () => {
    const titles: string[] = [];
    const collect = (entries: typeof NAV_STRUCTURE): void => {
      for (const entry of entries) {
        titles.push(entry.title);
        if (entry.children) collect(entry.children);
      }
    };
    collect(NAV_STRUCTURE);
    for (const label of [
      "Buscar Jogos",
      "Famílias",
      "Consoles (gerações)",
      "Minha Biblioteca",
      "Jogos",
      "Favoritos",
      "Sem lista",
      "Minhas Listas",
      "Meu Top 10",
    ]) {
      expect(titles).toContain(label);
    }
    expect(titles).not.toContain("Meus Jogos");
    expect(titles).not.toContain("Todos os Jogos");
    expect(titles).not.toContain("Por Empresa");
  });

  it("uses English canonical routes (Portuguese URLs redirect)", () => {
    const paths = flattenNavPaths(NAV_STRUCTURE);
    for (const route of [
      "/home",
      "/dashboard",
      "/catalog",
      "/catalog/platforms",
      // Fase 7: canonical families route. /catalog/empresas still exists
      // as a company directory (Fase 9 decommission candidate) but is no
      // longer linked from the nav.
      "/catalog/families",
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

  it("exposes Meu Top 10 as a top-level entry bound to the existing route", () => {
    const top10 = NAV_STRUCTURE.find((entry) => entry.id === "top10");
    expect(top10?.title).toBe("Meu Top 10");
    expect(top10?.path).toBe("/backlog/top10");
  });

  it("points Famílias at the canonical ATP taxonomy route", () => {
    const buscar = NAV_STRUCTURE.find((entry) => entry.id === "buscar-jogos");
    const familias = buscar?.children?.find((entry) => entry.id === "familias");
    expect(familias?.path).toBe("/catalog/families");
    expect(flattenNavPaths(NAV_STRUCTURE)).toContain("/catalog/families");
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
