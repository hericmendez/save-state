"use client";

import Image from "next/image";
import RPGUIButton from "@/components/RPGUI/Button";
import {
  DataTableCell,
  DataTableHeaderCell,
  DataTableHeaderRow,
  DataTableRow,
} from "./data-table";
import { getStatusLabel } from "./status-labels";
import { sizedIgdbImageUrl } from "./game-card-model";
import type { Game } from "@/features/shared/types";

/**
 * Backlog table layout (list-mode upgrade).
 * Mobile shows Jogo + Status + Favorito + Ações; the remaining columns
 * join at md inside the same horizontal-scroll table (rows never become
 * cards). The header and every row share these templates so columns stay
 * aligned.
 */
export const BACKLOG_TABLE_GRID =
  "grid-cols-[minmax(0,1fr)_auto_auto_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto_auto_auto_auto]";

export const BACKLOG_TABLE_MIN_WIDTH = "min-w-[520px] md:min-w-[820px]";

export function BacklogTableHeader() {
  return (
    <DataTableHeaderRow gridClass={BACKLOG_TABLE_GRID}>
      <DataTableHeaderCell>Jogo</DataTableHeaderCell>
      <DataTableHeaderCell>Plataforma</DataTableHeaderCell>
      <DataTableHeaderCell>Status</DataTableHeaderCell>
      <DataTableHeaderCell className="hidden md:block">
        Horas
      </DataTableHeaderCell>
      <DataTableHeaderCell className="hidden md:block">Nota</DataTableHeaderCell>
      <DataTableHeaderCell>Favorito</DataTableHeaderCell>
      <DataTableHeaderCell>Ações</DataTableHeaderCell>
    </DataTableHeaderRow>
  );
}

export function BacklogTableRow({
  game,
  onDetails,
}: {
  game: Game;
  onDetails: () => void;
}) {
  const name = game.game?.name ?? "Jogo";
  const platforms = (game.game?.platforms ?? []).slice(0, 2).join(", ");

  return (
    <DataTableRow gridClass={BACKLOG_TABLE_GRID} label={name} onActivate={onDetails}>
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
          <span className="truncate font-bold text-white">
            {game.favorite ? "★ " : ""}
            {name}
            {game.finished ? ` · Zerado ${game.timesFinished ?? 0}×` : ""}
          </span>
        </span>
      </DataTableCell>
      <DataTableCell title={platforms} className="hidden md:block">
        <span className="truncate">{platforms || "—"}</span>
      </DataTableCell>
      <DataTableCell>
        {game.status ? getStatusLabel(game.status) : "—"}
      </DataTableCell>
      <DataTableCell className="hidden md:block">
        {typeof game.hoursPlayed === "number" ? `${game.hoursPlayed}h` : "—"}
      </DataTableCell>
      <DataTableCell className="hidden md:block">
        {typeof game.rating === "number" ? `★ ${game.rating}` : "—"}
      </DataTableCell>
      <DataTableCell>
        <span aria-label={game.favorite ? "Favorito" : "Não favoritado"}>
          {game.favorite ? "★" : "—"}
        </span>
      </DataTableCell>
      <DataTableCell>
        <RPGUIButton
          type="button"
          title="Detalhes"
          onClick={(event) => {
            event.stopPropagation();
            onDetails();
          }}
        />
      </DataTableCell>
    </DataTableRow>
  );
}
