import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import RPGUIButton from "@/components/RPGUI/Button";
import { getCurrentSession } from "@/server/auth/session";
import { listAtpPlatforms } from "@/server/atp/client";
import  RPGUISelect from "@/components/RPGUI/Select";
import RPGUInput from "@/components/RPGUI/Input";
const PAGE_SIZE = 24;

type PlatformSort = "name" | "releaseYear" | "gameCount";

function parseSort(value: string | undefined): PlatformSort {
  return value === "releaseYear" || value === "gameCount" ? value : "name";
}

function parseOrder(value: string | undefined): "asc" | "desc" {
  return value === "desc" ? "desc" : "asc";
}

function pageUrl(params: {
  company: string;
  sort: PlatformSort;
  order: "asc" | "desc";
  page: number;
}): string {
  const query = new URLSearchParams();
  if (params.company !== "") query.set("company", params.company);
  if (params.sort !== "name") query.set("sort", params.sort);
  if (params.order !== "asc") query.set("order", params.order);
  if (params.page !== 1) query.set("page", String(params.page));
  const serialized = query.toString();
  return serialized ? `/catalog/platforms?${serialized}` : "/catalog/platforms";
}

const SORT_LABELS: Record<PlatformSort, string> = {
  name: "Nome",
  releaseYear: "Ano",
  gameCount: "Jogos",
};

/**
 * Fase 7 — ATP-backed platform explorer. All data (ids, names, families,
 * counts) comes from ATP platform data via the BFF; nothing is hardcoded.
 * Fully server-rendered: search submits via GET form, sort/pagination via
 * links — no client state, no internal HTTP.
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
  const raw = await searchParams;
  const first = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value ?? "").trim();
  const company = first(raw.company).slice(0, 100);
  const sort = parseSort(first(raw.sort) || undefined);
  const order = parseOrder(first(raw.order) || undefined);
  const parsedPage = Number(first(raw.page));
  const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  let platforms: Awaited<ReturnType<typeof listAtpPlatforms>> | null = null;
  let unavailable = false;
  try {
    platforms = await listAtpPlatforms({
      companyName: company === "" ? undefined : company,
      sort,
      order,
      page,
      limit: PAGE_SIZE,
      showEmptyPlatforms: false,
    });
  } catch (err) {
    unavailable = err instanceof ApiError && err.code === "ATP_UNAVAILABLE";
    if (!unavailable) throw err;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Plataformas</h1>
        <p className="mt-2 text-sm">
          Escolha uma plataforma para ver seus jogos no catálogo.
        </p>
      </header>
      <form
        method="get"
        action="/catalog/platforms"
        className="rpgui-container framed-golden flex flex-wrap items-end gap-2 p-4"
      >
        <label className="flex flex-col gap-1 text-xs">
          Empresa
          <RPGUInput
            type="search"
            name="company"
            defaultValue={company}
            placeholder="Ex.: Nintendo"
            maxLength={100}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Ordenar por
          <RPGUISelect  name="sort" defaultValue={sort}>
            {(Object.keys(SORT_LABELS) as PlatformSort[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </RPGUISelect>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Ordem
          <RPGUISelect  name="order" defaultValue={order}>
            <option value="asc">ASC</option>
            <option value="desc">DESC</option>
          </RPGUISelect>
        </label>
        <RPGUIButton type="submit" title="Buscar" />
      </form>
      {unavailable || !platforms ? (
        <p role="alert" className="rpgui-container framed-grey p-3">
          O catálogo está temporariamente indisponível. Tente novamente em
          instantes.
        </p>
      ) : platforms.data.length === 0 ? (
        <p>Nenhuma plataforma disponível.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {platforms.data.map((platform) => (
              <Link
                key={platform.id}
                href={`/catalog/platforms/${encodeURIComponent(platform.id)}`}
                className="rpgui-container framed-golden block p-4"
              >
                <h2 className="font-display text-lg">{platform.name}</h2>
                <p className="mt-1 text-xs">
                  {[platform.company, platform.family]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-xs">
                  {platform.releaseYear ?? "Ano desconhecido"} ·{" "}
                  {platform.gameCount}{" "}
                  {platform.gameCount === 1 ? "jogo" : "jogos"}
                </p>
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={pageUrl({ company, sort, order, page: page - 1 })}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            >
              <RPGUIButton title="‹ Anterior" />
            </Link>
            <span className="text-sm">
              Página {platforms.pagination.page} de {platforms.pagination.totalPages} ·{" "}
              {platforms.pagination.total} plataformas
            </span>
            <Link
              href={pageUrl({ company, sort, order, page: page + 1 })}
              aria-disabled={page >= platforms.pagination.totalPages}
              className={
                page >= platforms.pagination.totalPages
                  ? "pointer-events-none opacity-50"
                  : undefined
              }
            >
              <RPGUIButton title="Próxima ›" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
