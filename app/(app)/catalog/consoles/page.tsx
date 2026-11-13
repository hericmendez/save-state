import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getAllCatalogPlatforms } from "@/server/search/catalog-reads";
import { listGenerations } from "@/features/catalog/generations/generation-map";
import { PlatformCard } from "@/features/catalog/platform-card";

/**
 * Fase 8 — editorial console generations.
 *
 * Generation identity/order comes from Save State editorial configuration.
 * Platform metadata comes from the active search provider via the neutral
 * catalog reads (matched by name or Save State alias). Unmapped editorial
 * consoles remain valid and render without catalog metadata.
 */
export default async function ConsolesPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog/consoles");
  }

  const [generations, catalogPlatforms] = await Promise.all([
    Promise.resolve(listGenerations()),
    getAllCatalogPlatforms(),
  ]);

  const platformByName = new Map(
    catalogPlatforms.flatMap((platform) => [
      [platform.name.trim().toLowerCase(), platform] as const,
      ...((platform.aliases ?? []).map(
        (alias) =>
          [alias.trim().toLowerCase(), platform] as const,
      )),
    ]),
  );

  const enrichedGenerations = generations.map((generation) => ({
    ...generation,

    consoles: generation.consoles.map((consoleItem) => ({
      ...consoleItem,

      platform: consoleItem.atpPlatforms
        .map((name) => platformByName.get(name.trim().toLowerCase()))
        .find(Boolean),
    })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Consoles por Geração</h1>

        <p className="mt-2 text-sm">
          Uma viagem pela história dos consoles, da Geração 9 até a Geração 1.
          Escolha uma geração para ver seus consoles e jogos.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {enrichedGenerations.map((generation) => (
          <details
            key={generation.id}
            open
            className="rpgui-container framed-grey p-4"
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
                  {generation.consoles.length}{" "}
                  {generation.consoles.length === 1
                    ? "plataforma"
                    : "plataformas"}
                </p>
              </div>

              <span className="shrink-0 text-xs underline opacity-70">
                esconder
              </span>
            </summary>

            <hr className="my-3" />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {generation.consoles.map((consoleItem) => (
                <PlatformCard
                  key={consoleItem.id}
                  platform={consoleItem.platform}
                  name={consoleItem.name}
                  manufacturer={`${consoleItem.manufacturer}`}
                />
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
