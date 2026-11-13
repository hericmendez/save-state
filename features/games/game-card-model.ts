import type { Game } from "@/features/shared/types";
import type { AtpSearchCard } from "@/features/atp/atp-result";
import { getStatusLabel } from "./status-labels";

/**
 * Rewrite a known IGDB image URL to another delivery variant (Fase 2).
 * Only `images.igdb.com` URLs are rewritten; every other source (ATP,
 * local fallback, unknown hosts) passes through untouched, and null
 * stays null. Unknown IGDB sizes are left as-is rather than guessed.
 */
export function sizedIgdbImageUrl(
  url: string | null,
  size: "t_cover_small" | "t_cover_big" | "t_thumb" | "t_logo_med",
): string | null {
  if (!url) return null;
  if (!url.includes("images.igdb.com")) return url;
  return url.replace(/\/t_[A-Za-z0-9_]+(?=\/[^/]*$)/, `/${size}`);
}

export interface GameCardPresentation {
  id: string;
  title: string;
  coverUrl: string | null;
  subtitle?: string;
  metaLines: string[];
  isFavorite?: boolean;
  isOwned?: boolean;
}

export function toCardModelFromGame(game: Game): GameCardPresentation {
  const title = game.game?.name ?? "Jogo";
  const coverUrl = game.game?.cover ?? null;
  const subtitle = game.status ? getStatusLabel(game.status) : undefined;
  const metaLines: string[] = [];
  if (game.finished) metaLines.push(`Zerado ${game.timesFinished}×`);
  if (game.fullyCompleted) metaLines.push("100% completo");
  return {
    id: game._id,
    title,
    coverUrl,
    subtitle,
    metaLines,
    isFavorite: !!game.favorite,
    isOwned: false,
  };
}

export function toCardModelFromAtp(
  card: AtpSearchCard,
  coverUrl: string | null,
): GameCardPresentation {
  const subtitle = [card.year, ...card.platforms.slice(0, 3)]
    .filter(Boolean)
    .join(" · ");
  return {
    id: card.atpId,
    title: card.name,
    coverUrl,
    subtitle: subtitle || undefined,
    metaLines: [],
    isFavorite: false,
    isOwned: card.owned,
  };
}
