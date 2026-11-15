"use client";

import type { Game, GameCollection } from "@/features/shared/types";
import { GameContextMenu } from "./game-context-menu";
import { GameCardFrame } from "./game-card-frame";
import { toCardModelFromGame } from "./game-card-model";

export function GameCard({
  game,
  collections,
  onDetails,
  onEdit,
  onDelete,
  onCollectionChanged,
  onStatusChange,
  onError,
}: {
  game: Game;
  collections: GameCollection[];
  onDetails: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCollectionChanged?: () => void;
  onStatusChange?: (status: string) => () => void;
  onError?: (message: string) => void;
}) {
  const presentation = toCardModelFromGame(game);
  return (
    <GameContextMenu
      game={game}
      collections={collections}
      onDetails={onDetails}
      onEdit={onEdit}
      onDelete={onDelete}
      onCollectionChanged={onCollectionChanged}
      onStatusChange={onStatusChange}
      onError={onError}
    >
      <GameCardFrame presentation={presentation} onDetails={onDetails} />
    </GameContextMenu>
  );
}
