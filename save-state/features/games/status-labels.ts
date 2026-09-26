import type { GameStatus } from "@/schemas/games";

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  backlog: "Backlog",
  playing: "Jogando",
  replaying: "Rejogando",
  stalled: "Pausado",
  dropped: "Abandonado",
  limbo: "No limbo",
  endless: "Contínuo",
  achievement: "Caçando conquistas",
  finished: "Finalizado",
  wishlist: "Lista de desejos",
};

export function getStatusLabel(status: string): string {
  return (GAME_STATUS_LABELS as Record<string, string>)[status] ?? status;
}
