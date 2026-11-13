import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import {
  PLATFORM_PAGE_SIZES,
  listEditorialPlatforms,
  paginatePlatforms,
  parsePlatformsQuery,
  resolvePlatformThumb,
  serializePlatformsQuery,
  type PlatformAssetManifest,
} from "@/features/catalog/editorial-platforms";
import { PlatformCard } from "@/features/catalog/platform-card";
import RPGUIButton from "@/components/RPGUI/Button";
import RPGUISelect from "@/components/RPGUI/Select";

/**
 * Plataformas — editorial listing (Opção B) with URL pagination.
 *
 * Renders the curated local JSON (`atp-platforms-simplified.json`) in
 * editorial order, one `PlatformCard` per platform, each linking to the
 * existing detail route `/catalog/platforms/[platformId]`, which locks
 * the platform filter on the shared `CatalogSearch` experience.
 * No provider requests are made to render this listing.
 *
 * Pagination slices the local editorial array (default 16 → at most 32
 * card images per page, bounding concurrent `next/image` fetches). `page`
 * and `limit` live in the URL, so reload and back/forward navigation work
 * with zero client state; invalid values normalize to the nearest valid
 * page instead of an empty grid. Controls are plain links + a GET form,
 * so no JavaScript is required to paginate.
 */
export default async function PlatformsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/catalog/platforms");
  }

  const platforms = listEditorialPlatforms();
  const query = parsePlatformsQuery(await searchParams);
  const { items, page, totalPages } = paginatePlatforms(platforms, query);
  const manifest = loadPlatformAssetManifest();

  const pageHref = (target: number) => {
    const qs = serializePlatformsQuery({ page: target, limit: query.limit });
    return qs ? `/catalog/platforms?${qs}` : "/catalog/platforms";
  };

  const start = platforms.length === 0 ? 0 : (page - 1) * query.limit + 1;
  const end = Math.min(page * query.limit, platforms.length);

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Plataformas</h1>

        <p className="mt-2 text-sm">
          Escolha uma plataforma para ver seus jogos no catálogo.
        </p>

        <p className="mt-1 text-xs" aria-live="polite">
          Mostrando {start}–{end} de {platforms.length}{" "}
          {platforms.length === 1 ? "plataforma" : "plataformas"} · Página{" "}
          {page} de {totalPages}
        </p>

        {manifest && (
          <p className="mt-1 text-xs">
            <Link
              href="/catalog/platforms/atribuicoes"
              className="underline"
            >
              Atribuições das imagens
            </Link>
          </p>
        )}
      </header>

      {platforms.length === 0 ? (
        <p>Nenhuma plataforma disponível.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((platform) => (
            <PlatformCard
              key={platform.id}
              editorial={{
                ...platform,
                thumb: resolvePlatformThumb(platform, manifest),
              }}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Paginação de plataformas"
          className="rpgui-container framed-grey flex flex-wrap items-center gap-2 p-3"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rpgui-button px-3 py-1 text-sm"
              aria-label="Página anterior"
            >
              ‹ Anterior
            </Link>
          ) : (
            <span
              className="rpgui-button px-3 py-1 text-sm opacity-50"
              aria-disabled="true"
            >
              ‹ Anterior
            </span>
          )}

          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (target) =>
              target === page ? (
                <span
                  key={target}
                  className="rpgui-container framed-grey px-2 py-1 text-sm"
                  aria-current="page"
                >
                  {target}
                </span>
              ) : (
                <Link
                  key={target}
                  href={pageHref(target)}
                  className="rpgui-container px-2 py-1 text-sm"
                  aria-label={`Página ${target}`}
                >
                  {target}
                </Link>
              ),
          )}

          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="rpgui-button px-3 py-1 text-sm"
              aria-label="Próxima página"
            >
              Próxima ›
            </Link>
          ) : (
            <span
              className="rpgui-button px-3 py-1 text-sm opacity-50"
              aria-disabled="true"
            >
              Próxima ›
            </span>
          )}

          <form
            method="get"
            action="/catalog/platforms"
            className="ml-auto flex items-center gap-2"
          >
            <input type="hidden" name="page" value="1" />
            <label htmlFor="platforms-limit" className="text-sm">
              Por página:
            </label>
            <RPGUISelect
              id="platforms-limit"
              name="limit"
              defaultValue={query.limit}
            >
              {PLATFORM_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </RPGUISelect>
            <RPGUIButton type="submit" title="Aplicar" />
          </form>
        </nav>
      )}
    </div>
  );
}

/**
 * Local asset manifest (`public/platforms/manifest.json`, emitted by the
 * manual import script). Missing or unreadable → null, and every card keeps
 * its curated local path from the editorial JSON (nulls render the card
 * fallback), so the listing works with zero behavior change for pending
 * assets.
 */
function loadPlatformAssetManifest(): PlatformAssetManifest | null {
  try {
    const raw = readFileSync(
      join(process.cwd(), "public", "platforms", "manifest.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Partial<PlatformAssetManifest>;
    if (!parsed || typeof parsed !== "object" || !parsed.files) return null;
    return parsed as PlatformAssetManifest;
  } catch {
    return null;
  }
}
