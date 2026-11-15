import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import RPGUIButton from "@/components/RPGUI/Button";
import { getCurrentSession } from "@/server/auth/session";
import {
  getCatalogPlatform,
  isCatalogUnavailable,
} from "@/server/search/catalog-reads";
import {
  findEditorialPlatform,
  resolveEditorialIgdbIds,
} from "@/features/catalog/editorial-platforms";
import { CatalogSearch } from "@/features/atp/catalog-search";
import { PlatformGameCount } from "./platform-game-count";

function unavailableNotice() {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="rpgui-container framed-grey p-3">
        O catálogo está temporariamente indisponível. Tente novamente em
        instantes.
      </p>
    </div>
  );
}

/**
 * Platform detail (Opção B): the route param is the editorial slug from
 * `atp-platforms-simplified.json` (e.g. `nintendo-switch`), linked from
 * the editorial `PlatformCard` listing. The header prioritizes the
 * editorial identity (name/company/type/year) with the catalog's live
 * `gameCount`; the slug still resolves to the catalog platform (IGDB)
 * internally to lock the platform filter on the shared `CatalogSearch`
 * experience — the search behavior is unchanged.
 * Numeric IGDB ids keep working (back-compat with previous links).
 */
export default async function PlatformDetailPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const { platformId } = await params;
  const decoded = decodeURIComponent(platformId);

  const editorial = findEditorialPlatform(decoded);

  if (editorial) {
    // Fase 2 streaming: the header identity and the locked search render
    // immediately from editorial data. Only the live game count suspends.
    // The filter is equivalent to the previous catalog-name lock: the
    // editorial name resolves to the same validated id set (primary name
    // match, else the explicit fallback), unioned with `igdbIds`.
    const igdbIds = resolveEditorialIgdbIds(editorial);
    return (
      <div className="flex flex-col gap-4">
        <header className="rpgui-container framed-grey p-4">
          <Link className="mb-3 inline-block" href="/catalog/platforms">
            <RPGUIButton title="← Plataformas" />
          </Link>
          <h1 className="font-display text-2xl">{editorial.name}</h1>
          <p className="mt-2 text-sm">
            {[editorial.company, editorial.type].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-xs">
            {editorial.releaseYear ?? "Ano desconhecido"}
          </p>
          {igdbIds.length > 0 ? (
            <Suspense
              fallback={
                <p className="mt-1 text-xs" aria-live="polite">
                  Carregando catálogo…
                </p>
              }
            >
              <PlatformGameCount igdbId={String(igdbIds[0])} />
            </Suspense>
          ) : null}
        </header>
        <CatalogSearch
          fixedPlatforms={[editorial.name]}
          fixedPlatformIds={igdbIds.length > 0 ? igdbIds : undefined}
          initialContextName={editorial.name}
        />
      </div>
    );
  }

  let platform;
  try {
    platform = await getCatalogPlatform(decoded);
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.code === "ATP_GAME_NOT_FOUND" ||
        err.code === "IGDB_GAME_NOT_FOUND")
    ) {
      notFound();
    }
    if (isCatalogUnavailable(err)) {
      return unavailableNotice();
    }
    throw err;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <Link className="mb-3 inline-block" href="/catalog/platforms">
          <RPGUIButton title="← Plataformas" />
        </Link>
        <h1 className="font-display text-2xl">{platform.name}</h1>
        <p className="mt-2 text-sm">
          {[platform.company, platform.family].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-xs">
          {platform.releaseYear ?? "Ano desconhecido"} · {platform.gameCount}{" "}
          {platform.gameCount === 1 ? "jogo" : "jogos"} no catálogo
        </p>
      </header>
      <CatalogSearch
        fixedPlatforms={[platform.name]}
        initialContextName={platform.name}
      />
    </div>
  );
}
