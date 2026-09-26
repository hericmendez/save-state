import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGenerations } from "@/features/catalog/generations/generation-map";
import { ConsoleCard } from "@/features/catalog/platform-card";

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
      <div className="flex flex-col gap-4">
        {generations.map((generation) => (
          <details
            key={generation.id}
            open
            className="rpgui-container framed-golden p-4"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="font-display text-lg">{generation.name}</h2>
                  <span className="font-display text-xs opacity-70">
                    {generation.shortName}
                  </span>
                </div>
                <p className="mt-1 text-sm">{generation.description}</p>
                <p className="mt-1 text-xs opacity-70">
                  {generation.consoles.length} {generation.consoles.length === 1 ? "plataforma" : "plataformas"}
                </p>
              </div>
              <span className="shrink-0 text-xs underline opacity-70">esconder</span>
            </summary>
            <hr className="my-3" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {generation.consoles.map((consoleItem) => (
                <ConsoleCard key={consoleItem.id} name={consoleItem.name} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
