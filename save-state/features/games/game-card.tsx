"use client";

import type { Game, GameList } from "@/features/shared/types";
import { GameContextMenu } from "./game-context-menu";

export function GameCard({
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
      <article className="rpgui-container framed-golden relative aspect-[3/4] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/yugioh.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 w-full p-3">
          <h3 className="font-display text-sm">
            {game.favorite ? "★ " : ""}
            {game.game?.name ?? "Jogo"}
          </h3>
          {game.status && <p className="text-xs capitalize">{game.status}</p>}
          {game.finished && <p className="text-xs">Zerado {game.timesFinished}×</p>}
          {game.fullyCompleted && <p className="text-xs">100% completo</p>}
          <button
            className="rpgui-button mt-2"
            type="button"
            onClick={onDetails}
          >
            Detalhes
          </button>
        </div>
      </article>
    </GameContextMenu>
  );
}
