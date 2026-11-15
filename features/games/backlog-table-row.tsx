"use client";

import Image from "next/image";
import {
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableRow,
} from "./data-table";
import { getStatusLabel } from "./status-labels";
import { sizedIgdbImageUrl } from "./game-card-model";
import type { Game } from "@/features/shared/types";

/**
 * Backlog table layout (list-mode upgrade).
 * Mobile shows Jogo + Status + Favorito; the remaining columns join at md.
 * Real `<th>`/`<td>` cells plus a single `<colgroup>` mean the browser's
 * table algorithm owns every width, so header and rows cannot drift apart.
 *
 * There is intentionally no "Ações" column: the row itself is the trigger
 * for the details modal (click, Enter and Space), so a "Detalhes" button
 * would only duplicate it. Context actions stay in the row context menu.
 */
export const BACKLOG_TABLE_MIN_WIDTH = "min-w-[340px] md:min-w-[760px]";

export function BacklogTableHeader() {
  return (
    <>
      <colgroup>
        <col className="w-[44%] md:w-[32%]" />
        <col className="hidden md:table-column md:w-[20%]" />
        <col className="w-[26%] md:w-[15%]" />
        <col className="hidden md:table-column md:w-[10%]" />
        <col className="hidden md:table-column md:w-[10%]" />
        <col className="w-[30%] md:w-[13%]" />
      </colgroup>
      <DataTableHeader>
        <DataTableHeaderCell>Jogo</DataTableHeaderCell>
        <DataTableHeaderCell className="hidden md:table-cell">
          Plataforma
        </DataTableHeaderCell>
        <DataTableHeaderCell>Status</DataTableHeaderCell>
        <DataTableHeaderCell className="hidden md:table-cell">
          Horas
        </DataTableHeaderCell>
        <DataTableHeaderCell className="hidden md:table-cell">
          Nota
        </DataTableHeaderCell>
        <DataTableHeaderCell>Favorito</DataTableHeaderCell>
      </DataTableHeader>
    </>
  );
}

export function BacklogTableRow({
  game,
  onDetails,
  onContextMenu,
}: {
  game: Game;
  onDetails: () => void;
  onContextMenu?: React.MouseEventHandler<HTMLTableRowElement>;
}) {
  const name = game.game?.name ?? "Jogo";
  const platforms = (game.game?.platforms ?? []).slice(0, 2).join(", ");

  return (
    <DataTableRow
      label={name}
      onActivate={onDetails}
      onContextMenu={onContextMenu}
    >
      <DataTableCell title={name}>
        <span className="flex min-w-0 items-center gap-2">
          <Image
            src={sizedIgdbImageUrl(game.game?.cover ?? null, "t_cover_small") ?? "/yugioh.png"}
            alt=""
            aria-hidden="true"
            width={32}
            height={40}
            className="h-10 w-8 shrink-0 object-cover"
            loading="lazy"
          />
          <span className="min-w-0 font-bold text-white">
            {game.favorite ? "★ " : ""}
            {name}
            {game.finished ? ` · Zerado ${game.timesFinished ?? 0}×` : ""}
          </span>
        </span>
      </DataTableCell>
      <DataTableCell title={platforms} className="hidden md:table-cell">
        {platforms || "—"}
      </DataTableCell>
      <DataTableCell>
        {game.status ? getStatusLabel(game.status) : "—"}
      </DataTableCell>
      <DataTableCell className="hidden md:table-cell">
        {typeof game.hoursPlayed === "number" ? `${game.hoursPlayed}h` : "—"}
      </DataTableCell>
      <DataTableCell className="hidden md:table-cell">
        {typeof game.rating === "number" ? `★ ${game.rating}` : "—"}
      </DataTableCell>
      <DataTableCell>
        <span aria-label={game.favorite ? "Favorito" : "Não favoritado"}>
          {game.favorite ? "★" : "—"}
        </span>
      </DataTableCell>
    </DataTableRow>
  );
}
