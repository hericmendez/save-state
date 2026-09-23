import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGenerations } from "@/features/catalog/generations/generation-map";

/**
 * Fase 8 — editorial console generations (most recent first). Pure
 * configuration rendering: no ATP calls, no persistence, CSS-only visuals.
 */
export default async function ConsolesPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog/consoles");
  }
  const generations = listGenerations();

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Consoles por Geração</h1>
        <p className="mt-2 text-sm">
          Uma viagem pela história dos consoles, da Geração 9 até a Geração
          1. Escolha uma geração para ver seus consoles e jogos.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {generations.map((generation) => (
          <Link
            key={generation.id}
            href={`/catalog/consoles/${generation.id}`}
            className="rpgui-container framed-golden flex flex-col gap-2 p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg">{generation.name}</h2>
              <span className="font-display text-xs opacity-70">
                {generation.shortName}
              </span>
            </div>
            <p className="text-sm">{generation.description}</p>
            <p className="text-xs">
              {generation.consoles.map((console) => console.name).join(" · ")}
            </p>
            <span className="mt-auto pt-2 text-right text-sm">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
