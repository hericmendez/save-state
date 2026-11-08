import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RPGUIButton from "@/components/RPGUI/Button";
import { getCurrentSession } from "@/server/auth/session";
import {
  findGeneration,
  generationAtpPlatforms,
  generationHasAtpMapping,
} from "@/features/catalog/generations/generation-map";
import { CatalogSearch } from "@/features/atp/catalog-search";

/**
 * Fase 8 — generation detail: editorial identity always renders; ATP games
 * render only when the generation maps onto catalog platforms (ONE BFF
 * call with all names joined — never N requests). Unknown ids → notFound;
 * known generations without mapping → valid page + editorial state.
 */
export default async function GenerationDetailPage({
  params,
}: {
  params: Promise<{ generationId: string }>;
}) {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const { generationId } = await params;
  const generation = findGeneration(generationId);
  if (!generation) notFound();

  const atpPlatforms = generationAtpPlatforms(generation);
  const hasMapping = generationHasAtpMapping(generation);

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <Link className="mb-3 inline-block" href="/catalog/consoles">
          <RPGUIButton title="← Consoles" />
        </Link>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display text-2xl">{generation.name}</h1>
          <span className="font-display text-xs opacity-70">
            {generation.shortName}
          </span>
        </div>
        <p className="mt-2 text-sm">{generation.description}</p>
      </header>
      <section className="rpgui-container framed-golden p-4">
        <h2 className="font-display mb-3 text-lg">Consoles</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {generation.consoles.map((console) => (
            <li
              key={console.id}
              className="rpgui-container framed-grey p-3"
            >
              <p className="font-display text-sm">{console.name}</p>
              <p className="mt-1 text-xs">{console.manufacturer}</p>
            </li>
          ))}
        </ul>
      </section>
      {hasMapping ? (
        <CatalogSearch
          fixedPlatforms={atpPlatforms}
          initialContextName={generation.name}
        />
      ) : (
        <p className="rpgui-container framed-grey p-4">
          Nenhum mapeamento de catálogo ATP disponível para esta geração no
          momento.
        </p>
      )}
    </div>
  );
}
