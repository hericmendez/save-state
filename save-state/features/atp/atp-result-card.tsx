"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import RPGUIButton from "@/components/RPGUI/Button";
import type { AtpSearchCard } from "./atp-result";

function useAtpCover(atpId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ coverUrl: string | null }>(
      `/api/atp/games/${encodeURIComponent(atpId)}/cover`,
    )
      .then((result) => {
        if (!cancelled) setUrl(result.coverUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [atpId]);
  return url;
}

function AtpCoverImage({ atpId }: { atpId: string }) {
  const coverUrl = useAtpCover(atpId);
  // Upstream cover URLs can be garbage that fails to load: hide instead of
  // showing a broken image. No retry, no refetch.
  const [coverFailed, setCoverFailed] = useState(false);
  if (!coverUrl || coverFailed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt=""
      aria-hidden="true"
      className="h-full w-full object-cover"
      onError={() => setCoverFailed(true)}
    />
  );
}

export interface AtpCardActions {
  onPreview: () => void;
  onImport: () => void;
  importing: boolean;
}

/**
 * ATP domain grid card. Catalog data only (cover/title/year/platforms/
 * genres) plus the owned display flag — never UserGame metadata.
 */
export function AtpResultCard({
  item,
  onPreview,
  onImport,
  importing,
}: AtpCardActions & { item: AtpSearchCard }) {
  return (
    <article className="rpgui-container framed-golden relative aspect-[3/4] overflow-hidden">
      <div className="absolute inset-0 bg-black/40">
        <AtpCoverImage atpId={item.atpId} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 w-full p-3">
        <h3 className="font-display text-sm">{item.name}</h3>
        <p className="text-xs">
          {[item.year, ...item.platforms.slice(0, 3)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {item.owned ? (
          <p className="mt-2 text-xs">✓ No backlog</p>
        ) : (
          <RPGUIButton
            type="button"
            title={importing ? "Importando…" : "Adicionar ao Backlog"}
            onClick={onImport}
            disabled={importing}
            className="mt-2"
          />
        )}
        <RPGUIButton
          type="button"
          title="Detalhes"
          onClick={onPreview}
          className="mt-2"
        />
      </div>
    </article>
  );
}

/**
 * ATP domain list row. Same data contract as the grid card, tabular
 * presentation for the List view mode.
 */
export function AtpResultListItem({
  item,
  onPreview,
  onImport,
  importing,
}: AtpCardActions & { item: AtpSearchCard }) {
  return (
    <article className="rpgui-container framed-golden grid grid-cols-[1fr_auto] items-center gap-3 p-3">
      <div className="min-w-0">
        <h3 className="font-display truncate text-sm">{item.name}</h3>
        <p className="mt-1 text-xs">
          {[item.year, ...item.platforms.slice(0, 3)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {item.genres.length > 0 && (
          <p className="truncate text-xs">{item.genres.slice(0, 3).join(", ")}</p>
        )}
        {item.owned && <p className="mt-1 text-xs">✓ No backlog</p>}
      </div>
      <div className="flex gap-2">
        <RPGUIButton type="button" title="Detalhes" onClick={onPreview} />
        {!item.owned && (
          <RPGUIButton
            type="button"
            title={importing ? "Importando…" : "Adicionar"}
            onClick={onImport}
            disabled={importing}
          />
        )}
      </div>
    </article>
  );
}
