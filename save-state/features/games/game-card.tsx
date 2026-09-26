"use client";

import type { Game, GameList } from "@/features/shared/types";
import { GameContextMenu } from "./game-context-menu";
import { GameCardFrame } from "./game-card-frame";
import { toCardModelFromGame } from "./game-card-model";

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
  const presentation = toCardModelFromGame(game);
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
      <GameCardFrame presentation={presentation} onDetails={onDetails} />
    </GameContextMenu>
  );
}
