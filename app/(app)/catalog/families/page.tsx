import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import {
  isCatalogUnavailable,
  listCatalogFamilies,
} from "@/server/search/catalog-reads";
import { PlatformCard } from "@/features/catalog/platform-card";

/**
 * Fase 7 — family explorer. Families are derived server-side from ATP
 * platform data (no persistence): PC and Mobile appear here as plain
 * family values, with no special pages or rules.
 */
export default async function FamiliesPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog/families");
  }

  let families: Awaited<ReturnType<typeof listCatalogFamilies>> | null = null;
  let unavailable = false;
  try {
    families = await listCatalogFamilies();
  } catch (err) {
    unavailable = isCatalogUnavailable(err);
    if (!unavailable) throw err;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Famílias</h1>
        <p className="mt-2 text-sm">
          Escolha uma família de plataformas para ver seus jogos no catálogo.
        </p>
      </header>
      {unavailable || !families ? (
        <p role="alert" className="rpgui-container framed-grey p-3">
          O catálogo está temporariamente indisponível. Tente novamente em
          instantes.
        </p>
      ) : families.length === 0 ? (
        <p>Nenhuma família disponível.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {families.map((family) => (
            <details
              key={family.name}
              open
              className="rpgui-container framed-grey p-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg">{family.name}</h2>
                  <p className="text-xs opacity-80">
                    {family.platformCount}{" "}
                    {family.platformCount === 1 ? "plataforma" : "plataformas"} ·{" "}
                    {family.gameCount} {family.gameCount === 1 ? "jogo" : "jogos"}
                  </p>
                </div>
                <span className="shrink-0 text-xs underline opacity-70">esconder</span>
              </summary>
              <hr className="my-3" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {family.platforms.map((platform) => (
                  <PlatformCard key={platform.id} platform={platform} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
