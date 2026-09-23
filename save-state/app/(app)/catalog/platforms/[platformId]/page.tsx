import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import RPGUIButton from "@/components/RPGUI/Button";
import { getCurrentSession } from "@/server/auth/session";
import { getAtpPlatform } from "@/server/atp/client";
import { CatalogSearch } from "@/features/atp/catalog-search";

/**
 * Fase 7 — platform detail: header from ATP platform data, games from the
 * shared Fase 6 experience with the platform locked as route context.
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

  let platform;
  try {
    platform = await getAtpPlatform(decodeURIComponent(platformId));
  } catch (err) {
    if (err instanceof ApiError && err.code === "ATP_GAME_NOT_FOUND") {
      notFound();
    }
    if (err instanceof ApiError && err.code === "ATP_UNAVAILABLE") {
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
