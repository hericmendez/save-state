import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { listAtpFamilies } from "@/server/atp/families";

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

  let families: Awaited<ReturnType<typeof listAtpFamilies>> | null = null;
  let unavailable = false;
  try {
    families = await listAtpFamilies();
  } catch (err) {
    unavailable = err instanceof ApiError && err.code === "ATP_UNAVAILABLE";
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((family) => (
            <Link
              key={family.name}
              href={`/catalog/families/${encodeURIComponent(family.name)}`}
              className="rpgui-container framed-golden block p-4"
            >
              <h2 className="font-display text-lg">{family.name}</h2>
              <p className="mt-1 text-xs">
                {family.platformCount}{" "}
                {family.platformCount === 1 ? "plataforma" : "plataformas"} ·{" "}
                {family.gameCount} {family.gameCount === 1 ? "jogo" : "jogos"}
              </p>
              <p className="mt-1 truncate text-xs">
                {family.platforms
                  .slice(0, 4)
                  .map((platform) => platform.name)
                  .join(", ")}
                {family.platforms.length > 4 && "…"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
