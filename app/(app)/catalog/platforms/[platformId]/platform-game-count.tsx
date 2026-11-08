import { getCatalogPlatform } from "@/server/search/catalog-reads";

/**
 * Live catalog game count for an editorial detail header (Fase 2).
 *
 * Rendered inside `<Suspense>` so the page streams: the editorial header
 * and the locked game search render immediately, and only this line waits
 * for the catalog lookup. Any catalog failure degrades to nothing — the
 * editorial header and the (name + ids) locked search stay intact.
 */
export async function PlatformGameCount({ igdbId }: { igdbId: string }) {
  let gameCount: number | null = null;
  try {
    const platform = await getCatalogPlatform(igdbId);
    gameCount = platform.gameCount;
  } catch {
    return null;
  }
  return (
    <p className="mt-1 text-xs">
      {gameCount} {gameCount === 1 ? "jogo" : "jogos"} no catálogo
    </p>
  );
}
