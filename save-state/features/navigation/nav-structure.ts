/**
 * Navigation structure (pure data, no JSX): shared by desktop/mobile nav
 * and unit-testable without a component transform.
 */

export interface NavEntry {
  id: string;
  title: string;
  path?: string;
  action?: "create-list";
  children?: NavEntry[];
}

export const NAV_STRUCTURE: NavEntry[] = [
  { id: "home", title: "Home", path: "/home" },
  { id: "dashboard", title: "Dashboard", path: "/dashboard" },
  { id: "diario", title: "Diário", path: "/diary" },
  {
    id: "buscar-jogos",
    title: "Buscar Jogos",
    children: [
      { id: "busca-geral", title: "Busca Geral", path: "/catalog" },
      { id: "plataformas", title: "Plataformas", path: "/catalog/platforms" },
      // Fase 7: rota canônica de famílias (taxonomia ATP derivada).
      // /catalog/empresas permanece como diretório de empresas/developers/
      // publishers — semântica distinta, candidata a decommission na Fase 9.
      { id: "familias", title: "Famílias", path: "/catalog/families" },
      // Fase 8: página editorial de gerações implementada (generation-map);
      // o redirect temporário da Fase 1 foi substituído pela rota real.
      { id: "consoles", title: "Consoles (gerações)", path: "/catalog/consoles" },
    ],
  },
  {
    id: "biblioteca",
    title: "Meu Backlog",
    children: [
      { id: "new-game", title: "Novo Jogo", path: "/backlog/new" },
      // Compat: a rota interna /backlog permanece como "Jogos" (label desacoplado da URL).
      { id: "jogos", title: "Jogos", path: "/backlog" },
      { id: "favoritos", title: "Favoritos", path: "/backlog/favoritos" },
      // Fase 3: real derived view (listIds.length === 0 via withoutList=true).
      // No persisted GameList; same UserGame infrastructure as Jogos/Favoritos.
      { id: "sem-lista", title: "Jogos sem lista", path: "/backlog/without-list" },
    ],
  },
  {
    id: "listas",
    title: "Minhas Listas",
    children: [
      { id: "new-list", title: "Nova Lista", action: "create-list" },
      { id: "custom-lists", title: "Listas Personalizadas", path: "/backlog/lists" },
    ],
  },
  // Compat: a rota interna /backlog/top10 permanece; apenas o label/nível mudou (Fase 1 não toca Top 10).
  { id: "top10", title: "Meu Top 10", path: "/backlog/top10" },
  { id: "settings", title: "Configurações", path: "/settings" },
];

export function flattenNavPaths(entries: NavEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.path) paths.push(entry.path);
    if (entry.children) paths.push(...flattenNavPaths(entry.children));
  }
  return paths;
}
