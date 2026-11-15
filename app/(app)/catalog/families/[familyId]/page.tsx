import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RPGUIButton from "@/components/RPGUI/Button";
import { getCurrentSession } from "@/server/auth/session";
import {
  isCatalogUnavailable,
  listCatalogFamilies,
} from "@/server/search/catalog-reads";
import { CatalogSearch } from "@/features/atp/catalog-search";

/**
 * Fase 7 — family detail: header from the derived taxonomy, games from the
 * shared Fase 6 experience with the family locked as route context
 * (ATP platformFamily query, never client-side filtering).
 */
export default async function FamilyDetailPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const { familyId } = await params;
  const familyName = decodeURIComponent(familyId);

  let family;
  try {
    const families = await listCatalogFamilies();
    family = families.find((entry) => entry.name === familyName);
  } catch (err) {
    if (isCatalogUnavailable(err)) {
      return (
        <div className="flex flex-col gap-4">
          <p role="alert" className="rpgui-container framed-grey p-3">
            O catálogo está temporariamente indisponível. Tente novamente em
            instantes.
          </p>
        </div>
      );
    }
    throw err;
  }
  if (!family) notFound();

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <Link className="mb-3 inline-block" href="/catalog/families">
          <RPGUIButton title="← Famílias" />
        </Link>
        <h1 className="font-display text-2xl">{family.name}</h1>
        <p className="mt-2 text-sm">
          {family.platformCount}{" "}
          {family.platformCount === 1 ? "plataforma" : "plataformas"} ·{" "}
          {family.gameCount} {family.gameCount === 1 ? "jogo" : "jogos"} no
          catálogo
        </p>
        <p className="mt-1 text-xs">
          {family.platforms.map((platform) => platform.name).join(", ")}
        </p>
      </header>
      <CatalogSearch fixedFamily={family.name} initialContextName={family.name} />
    </div>
  );
}
