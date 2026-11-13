/**
 * Navigation structure (pure data, no JSX): shared by desktop/mobile nav
 * and unit-testable without a component transform.
 */

export interface NavEntry {
  id: string;
  title: string;
  path?: string;
  action?: "create-collection";
  children?: NavEntry[];
}

export const NAV_STRUCTURE: NavEntry[] = [
  { id: "home", title: "Home", path: "/home" },
  { id: "dashboard", title: "Dashboard", path: "/dashboard" },
  // Etapa 5: "Diário" renamed to "Atividade". Route /diary unchanged.
  { id: "atividade", title: "Atividade", path: "/diary" },
  {
    id: "buscar-jogos",
    title: "Buscar Jogos",
    children: [
      { id: "busca-geral", title: "Busca Geral", path: "/catalog" },
      { id: "plataformas", title: "Plataformas", path: "/catalog/platforms" },
      // Etapa 5: Famílias/Consoles are no longer standalone menu items.
      // Family filtering lives inside Busca Geral (family filter input +
      // fixedFamily route context); the /catalog/families and
      // /catalog/consoles routes remain reachable directly.
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
      // Etapa 5: "Jogos sem lista" moved to the Minhas coleções group.
    ],
  },
  {
    // Etapa 6: domain migrated to GameCollection/collectionIds; routes
    // /backlog/lists* preserved (Ajuste 1 — URLs unchanged).
    id: "colecoes",
    title: "Minhas coleções",
    children: [
      { id: "new-collection", title: "Nova Coleção", action: "create-collection" },
      // Index of all user collections (replaces "Listas Personalizadas"
      // as the entry point; collections also appear directly below).
      { id: "all-collections", title: "Todas as coleções", path: "/backlog/lists" },
      // Derived view (collectionIds.length === 0 via withoutCollection).
      // No persisted GameCollection; same UserGame infrastructure.
      { id: "sem-colecao", title: "Jogos sem coleção", path: "/backlog/without-list" },
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
