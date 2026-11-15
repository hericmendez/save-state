"use client";

import Image from "next/image";
import RPGUIButton from "@/components/RPGUI/Button";
import {
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableRow,
} from "@/features/games/data-table";
import { sizedIgdbImageUrl } from "@/features/games/game-card-model";
import type { AtpSearchCard } from "./atp-result";
import { useAtpCover } from "./use-atp-cover";

/**
 * Catalog table layout (list-mode upgrade).
 * Mobile shows Jogo + Lançamento + Ação; Plataformas/Gêneros join at md.
 * Real `<th>`/`<td>` cells plus one `<colgroup>` keep every width under the
 * browser's table algorithm, so header and rows share the same geometry.
 */
export const CATALOG_TABLE_MIN_WIDTH = "min-w-[600px] md:min-w-[760px]";

export function CatalogTableHeader() {
  return (
    <>
      <colgroup>
        <col className="md:w-[32%]" />
        <col className="w-[8rem] md:w-[13%]" />
        <col className="hidden md:table-column md:w-[21%]" />
        <col className="hidden md:table-column md:w-[21%]" />
        <col className="w-[16rem] md:w-[12rem]" />
      </colgroup>
      <DataTableHeader>
        <DataTableHeaderCell>Jogo</DataTableHeaderCell>
        <DataTableHeaderCell>Lançamento</DataTableHeaderCell>
        <DataTableHeaderCell className="hidden md:table-cell">
          Plataformas
        </DataTableHeaderCell>
        <DataTableHeaderCell className="hidden md:table-cell">
          Gêneros
        </DataTableHeaderCell>
        <DataTableHeaderCell>Ação</DataTableHeaderCell>
      </DataTableHeader>
    </>
  );
}

function miniCover(coverUrl: string | null) {
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
  onContextMenu,
}: {
  card: AtpSearchCard;
  onDetails: () => void;
  onImport: () => void;
  importing: boolean;
  onContextMenu?: React.MouseEventHandler<HTMLTableRowElement>;
}) {
  const coverUrl = useAtpCover(card.atpId, card.coverUrl);
  const platforms = card.platforms.slice(0, 2).join(", ");
  const genres = card.genres.slice(0, 2).join(", ");

  return (
    <DataTableRow
      label={card.name}
      onActivate={onDetails}
      onContextMenu={onContextMenu}
    >
      <DataTableCell title={card.name}>
        <span className="flex min-w-0 items-center gap-2">
          {miniCover(coverUrl)}
          <span className="min-w-0 font-bold text-white">{card.name}</span>
          {card.owned && <span className="shrink-0 text-xs">✓</span>}
        </span>
      </DataTableCell>
      <DataTableCell>{card.year ?? "—"}</DataTableCell>
      <DataTableCell title={platforms} className="hidden md:table-cell">
        {platforms || "—"}
      </DataTableCell>
      <DataTableCell title={genres} className="hidden md:table-cell">
        {genres || "—"}
      </DataTableCell>
      <DataTableCell>
        {card.owned ? (
          <span className="text-xs">No backlog</span>
        ) : (
          <RPGUIButton
            type="button"
            className="w-full"
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
