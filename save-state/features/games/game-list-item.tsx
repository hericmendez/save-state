"use client";

import type { Game, GameList } from "@/features/shared/types";
import { GameContextMenu } from "./game-context-menu";
import { getStatusLabel } from "./status-labels";
import RPGUIButton from "@/components/RPGUI/Button";

export function GameListItem({
  game,
  lists,
  onDetails,
  onEdit,
  onDelete,
  onListChanged,
  onError,
}: {
  game: Game;
  lists: GameList[];
  onDetails: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onListChanged?: () => void;
  onError?: (message: string) => void;
}) {
  return (
    <GameContextMenu
      game={game}
      lists={lists}
      onDetails={onDetails}
      onEdit={onEdit}
      onDelete={onDelete}
      onListChanged={onListChanged}
      onError={onError}
    >
      <article className="rpgui-container framed-golden grid grid-cols-[1fr_auto] items-center gap-3 p-3">
        <div>
          <h3 className="font-display text-sm">
            {game.favorite ? "★ " : ""}
            {game.game?.name ?? "Jogo"}
            {game.finished ? ` · Zerado ${game.timesFinished}×` : ""}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {(game.game?.genres ?? []).map((genre) => (
              <span key={genre} className="rpgui-container framed-grey px-2 text-xs">
                {genre}
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs">
            {game.status ? <span>{getStatusLabel(game.status)}</span> : null}
            {typeof game.hoursPlayed === "number" ? (
              <span> · {game.hoursPlayed}h</span>
            ) : null}
            {typeof game.rating === "number" ? (
              <span> · ★ {game.rating}</span>
            ) : null}
          </p>
        </div>
        <RPGUIButton type="button" title="Detalhes" onClick={onDetails} />
      </article>
    </GameContextMenu>
  );
}
