/**
 * Deterministic preview fixtures for the Activity Feed (E1.75).
 *
 * Exclusively for the isolated `/activity-preview` route and its tests.
 * Every event uses a fixed `createdAt` (America/Sao_Paulo logical days)
 * and a stable `_id` — no `Date.now()`, no randomness. All known-type
 * events satisfy `parseActivityEvent`; the single `future.unknown` entry
 * exercises the unknown-type fallback.
 */

import type { ActivityEventDTO } from "./presentation";

const USER_ID = "000000000000000000000001";
const WISHLIST_ID = "000000000000000000000011";
const FAVORITES_LIST_ID = "000000000000000000000012";

let sequence = 0;

function id(): string {
  sequence += 1;
  return `feed${String(sequence).padStart(20, "0")}`;
}

/** São Paulo local wall time → UTC ISO (UTC-3, no DST in September). */
function sp(day: number, hour: number, minute: number): string {
  return new Date(Date.UTC(2026, 8, day, hour + 3, minute)).toISOString();
}

function base(
  type: string,
  createdAt: string,
  rest: Partial<ActivityEventDTO> = {},
): ActivityEventDTO {
  return {
    _id: id(),
    type,
    userId: USER_ID,
    metadata: {},
    createdAt,
    ...rest,
  };
}

function game(
  type: string,
  createdAt: string,
  name: string,
  metadata: Record<string, unknown> = {},
  cover?: string,
): ActivityEventDTO {
  return base(type, createdAt, {
    userGameId: id(),
    game: cover ? { name, cover } : { name },
    metadata,
  });
}

export const PREVIEW_TIME_ZONE = "America/Sao_Paulo";

export const PREVIEW_FEED_EVENTS: ActivityEventDTO[] = [
  // ---- 20 de setembro: quiet day (second day section) ----
  game("game.added", sp(20, 20, 5), "Stardew Valley", { source: "manual" }),
  game("game.rating_changed", sp(20, 20, 40), "Stardew Valley", {
    from: null,
    to: 9,
  }),

  // ---- 21 de setembro ----
  // Four favorites inside the 30-minute chain → one group.
  game("game.favorited", sp(21, 9, 1), "Chrono Trigger"),
  game("game.favorited", sp(21, 9, 2), "Resident Evil 4"),
  game(
    "game.favorited",
    sp(21, 9, 4),
    "Nuclear Throne",
    {},
    "https://img.test/nuclear-throne.png",
  ),
  game("game.favorited", sp(21, 9, 8), "Clair Obscur: Expedition 33"),

  // Same type, far apart → separate groups.
  game("game.favorited", sp(21, 10, 0), "Hollow Knight"),
  game("game.favorited", sp(21, 10, 45), "Celeste"),

  // Interleave: fav, fav, finished, fav → A(2) + finished + fav.
  game("game.favorited", sp(21, 11, 0), "Hades"),
  game("game.favorited", sp(21, 11, 2), "Dead Cells"),
  game("game.finished", sp(21, 11, 4), "Hades", { timesFinished: 3 }),
  game("game.favorited", sp(21, 11, 6), "Slay the Spire"),

  // Finished cluster → one group.
  game("game.finished", sp(21, 14, 0), "Legend of Legaia", { timesFinished: 2 }),
  game("game.finished", sp(21, 14, 5), "Resident Evil 4", { timesFinished: 23 }),
  game("game.finished", sp(21, 14, 8), "Portal", { timesFinished: 1 }),

  // Singleton: status change.
  game("game.status_changed", sp(21, 15, 0), "Clair Obscur: Expedition 33", {
    from: "stalled",
    to: "playing",
  }),

  // Membership: three into the same list → one group…
  game(
    "game.added_to_list",
    sp(21, 16, 0),
    "Chrono Trigger",
    {},
  ),
  game("game.added_to_list", sp(21, 16, 3), "Resident Evil 4"),
  game("game.added_to_list", sp(21, 16, 5), "Ocarina of Time"),
  // …plus one into another list → never mixed in.
  game("game.added_to_list", sp(21, 16, 7), "Tetris Effect"),

  // Top 10 adds → one group.
  base("top10.added", sp(21, 17, 0), {
    userGameId: id(),
    game: { name: "Chrono Trigger" },
    metadata: { position: 7 },
  }),
  base("top10.added", sp(21, 17, 2), {
    userGameId: id(),
    game: { name: "Resident Evil 4" },
    metadata: { position: 8 },
  }),
  base("top10.added", sp(21, 17, 4), {
    userGameId: id(),
    game: { name: "Ocarina of Time" },
    metadata: { position: 9 },
  }),

  // Top 10 removals: grouped strictly by reason.
  base("top10.removed", sp(21, 18, 0), {
    userGameId: id(),
    game: { name: "Game Manual A" },
    metadata: { position: 9, reason: "manual" },
  }),
  base("top10.removed", sp(21, 18, 5), {
    userGameId: id(),
    game: { name: "Game Manual B" },
    metadata: { position: 8, reason: "manual" },
  }),
  base("top10.removed", sp(21, 18, 10), {
    userGameId: id(),
    game: { name: "Game Unfav" },
    metadata: { position: 5, reason: "unfavorited" },
  }),
  base("top10.removed", sp(21, 18, 40), {
    userGameId: id(),
    game: { name: "Game Deleted" },
    metadata: { position: 3, reason: "game_deleted" },
  }),

  // Reorder with a Top 1 move → named title.
  base("top10.reordered", sp(21, 19, 0), {
    metadata: {
      count: 9,
      moves: [
        {
          userGameId: id(),
          from: 4,
          to: 1,
          game: {
            name: "The Legend of Zelda: Ocarina of Time",
            cover: "https://img.test/ocarina.png",
          },
        },
        {
          userGameId: id(),
          from: 1,
          to: 2,
          game: { name: "Resident Evil 4" },
        },
        {
          userGameId: id(),
          from: 2,
          to: 4,
          game: { name: "Chrono Trigger" },
        },
      ],
    },
  }),

  // Reorder without a Top 1 move → normal title.
  base("top10.reordered", sp(21, 19, 30), {
    metadata: {
      count: 9,
      moves: [
        {
          userGameId: id(),
          from: 5,
          to: 6,
          game: { name: "Hollow Knight" },
        },
        { userGameId: id(), from: 6, to: 5, game: { name: "Celeste" } },
      ],
    },
  }),

  // Legacy/unknown type → fallback, never breaks the screen.
  base("future.unknown", sp(21, 20, 0), {
    userGameId: id(),
    game: { name: "The Witcher 3" },
    metadata: {},
  }),

  // Midnight: 23:59 (Sep 21 SP) and 00:01 (Sep 22 SP) → different days.
  game("game.favorited", sp(21, 23, 59), "Midnight Oil"),
  game("game.favorited", sp(22, 0, 1), "After Hours"),
];

/** List snapshots applied by tests/components (fixtures carry names only). */
export function withListSnapshots(
  events: ActivityEventDTO[],
): ActivityEventDTO[] {
  return events.map((event) => {
    if (
      event.type !== "game.added_to_list" ||
      !event.game ||
      event.list !== undefined
    ) {
      return event;
    }
    const wishlistNames = ["Chrono Trigger", "Resident Evil 4", "Ocarina of Time"];
    const list = wishlistNames.includes(event.game.name)
      ? { listId: WISHLIST_ID, name: "Favoritos para jogar" }
      : { listId: FAVORITES_LIST_ID, name: "Wishlist" };
    return { ...event, list };
  });
}

export const PREVIEW_EVENTS_WITH_LISTS = withListSnapshots(PREVIEW_FEED_EVENTS);
