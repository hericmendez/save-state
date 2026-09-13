import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { CatalogSearch } from "@/features/atp/catalog-search";

export default async function PorPlataformaPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog/plataformas");
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Buscar por Plataforma</h1>
        <p className="mt-2 text-sm">Filtre o catálogo por plataforma. Use a busca geral com filtro de plataforma.</p>
      </header>
      <CatalogSearch />
    </div>
  );
}
