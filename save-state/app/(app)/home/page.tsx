import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { HomeFeed } from "@/features/activity/home-feed";

const SHORTCUTS: Array<{ title: string; description: string; href: string }> = [
  {
    title: "Meus Jogos",
    description: "Ver backlog, favoritos e detalhes dos jogos.",
    href: "/backlog",
  },
  {
    title: "Buscar Jogos",
    description: "Procurar no catálogo e importar para a biblioteca.",
    href: "/catalog",
  },
  {
    title: "Minhas Listas",
    description: "Organizar os jogos em listas personalizadas.",
    href: "/backlog/lists",
  },
  {
    title: "Dashboard",
    description: "Estatísticas e métricas da biblioteca.",
    href: "/dashboard",
  },
];

/**
 * Authenticated home. A hub of links into the normal app flows —
 * deliberately not a second dashboard: no stats, no aggregations.
 */
export default async function HomePage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/home");
  }
  return (
    <main className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Home</h1>
        <p className="mt-2 text-sm">
          Bem-vindo ao Save State. Escolha por onde continuar.
        </p>
      </header>
      
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.href}
            href={shortcut.href}
            className="rpgui-container framed-golden block p-4"
          >
            <h2 className="font-display text-lg">{shortcut.title}</h2>
            <p className="mt-1 text-sm">{shortcut.description}</p>
          </Link>
        ))}
      </div>
      {/*
        Real Activity Feed (E2.2): HomeFeed fetches GET /api/activity on
        the client and renders the shared ActivityFeed. No fixtures here;
        the isolated preview keeps using them independently.
      */}
      <section className="m-5" aria-label="Atividade recente">
        <HomeFeed />
      </section>
    </main>
  );
}
