"use client";

import Image from "next/image";
import RPGUIButton from "@/components/RPGUI/Button";
import {
  DataTableCell,
  DataTableHeaderCell,
  DataTableHeaderRow,
  DataTableRow,
} from "@/features/games/data-table";
import { sizedIgdbImageUrl } from "@/features/games/game-card-model";
import type { AtpSearchCard } from "./atp-result";
import { useAtpCover } from "./use-atp-cover";

/**
 * Catalog table layout (list-mode upgrade).
 * Mobile shows Jogo + Lançamento + Ação; Plataformas/Gêneros join at md.
 * The header and every row share these templates so columns stay aligned.
 */
export const CATALOG_TABLE_GRID =
  "grid-cols-[minmax(0,1fr)_auto_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]";

export const CATALOG_TABLE_MIN_WIDTH = "min-w-[540px] md:min-w-[760px]";

export function CatalogTableHeader() {
  return (
    <DataTableHeaderRow gridClass={CATALOG_TABLE_GRID}>
      <DataTableHeaderCell>Jogo</DataTableHeaderCell>
      <DataTableHeaderCell>Lançamento</DataTableHeaderCell>
      <DataTableHeaderCell className="hidden md:block">
        Plataformas
      </DataTableHeaderCell>
      <DataTableHeaderCell className="hidden md:block">
        Gêneros
      </DataTableHeaderCell>
      <DataTableHeaderCell>Ação</DataTableHeaderCell>
    </DataTableHeaderRow>
  );
}

function miniCover(coverUrl: string | null, name: string) {
  // 32px thumbs fetch the small IGDB variant; every other source keeps
  // its own URL. Missing covers keep the local fallback.
  const src = sizedIgdbImageUrl(coverUrl, "t_cover_small") ?? "/yugioh.png";
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={32}
      height={40}
      className="h-10 w-8 shrink-0 object-cover"
      loading="lazy"
    />
  );
}

export function CatalogTableRow({
  card,
  onDetails,
  onImport,
  importing,
}: {
  card: AtpSearchCard;
  onDetails: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  const coverUrl = useAtpCover(card.atpId, card.coverUrl);
  const platforms = card.platforms.slice(0, 2).join(", ");
  const genres = card.genres.slice(0, 2).join(", ");

  return (
    <DataTableRow
      gridClass={CATALOG_TABLE_GRID}
      label={card.name}
      onActivate={onDetails}
    >
      <DataTableCell title={card.name}>
        <span className="flex min-w-0 items-center gap-2">
          {miniCover(coverUrl, card.name)}
          <span className="truncate font-bold text-white">{card.name}</span>
          {card.owned && <span className="shrink-0 text-xs">✓</span>}
        </span>
      </DataTableCell>
      <DataTableCell>{card.year ?? "—"}</DataTableCell>
      <DataTableCell title={platforms} className="hidden md:block">
        <span className="truncate">{platforms || "—"}</span>
      </DataTableCell>
      <DataTableCell title={genres} className="hidden md:block">
        <span className="truncate">{genres || "—"}</span>
      </DataTableCell>
      <DataTableCell>
        {card.owned ? (
          <span className="text-xs">No backlog</span>
        ) : (
          <RPGUIButton
            type="button"
            title={importing ? "Importando…" : "Adicionar"}
            onClick={(event) => {
              event.stopPropagation();
              onImport();
            }}
            disabled={importing}
          />
        )}
      </DataTableCell>
    </DataTableRow>
  );
}
