import "server-only";
import { Types } from "mongoose";
import { connectDatabase } from "@/db/connection";
import { User } from "@/db/models/user";
import { GlobalGame } from "@/db/models/global-game";
import { UserGame } from "@/db/models/user-game";
import { GameCollection } from "@/db/models/game-collection";
import { GameReview } from "@/db/models/game-review";

export interface ExportPayload {
  exportedAt: string;
  user: { id: string; name: string; email: string };
  games: Array<{
    id: string;
    game: { name: string; cover?: string };
    status: string;
    hoursPlayed: number;
    timesFinished: number;
    finished: boolean;
    favorite: boolean;
    fullyCompleted: boolean;
    achievements: boolean;
    achievementProgress?: number | null;
    achievementsCompleted: boolean;
    rating?: number | null;
    review?: string | null;
    collectionIds: string[];
  }>;
  collections: Array<{ id: string; name: string }>;
}

const FORMULA_PREFIX = /^[\s\u0000-\u001f\u007f-\u009f\ufeff]*[=+\-@]/;

export async function buildExportPayload(userId: string): Promise<ExportPayload> {
  await connectDatabase();
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");
  const [userGames, collections] = await Promise.all([
    UserGame.find({ userId }).populate("gameId").lean(),
    GameCollection.find({ userId }).lean(),
  ]);
  // Single batched read of full Markdown — no N+1 over the library.
  // GameReview.content is the single source of truth (no legacy mirror).
  const ids = (userGames as Array<Record<string, unknown>>).map(
    (raw) => raw._id as Types.ObjectId,
  );
  const reviews = ids.length
    ? await GameReview.find({ userGameId: { $in: ids } })
        .select("userGameId content")
        .lean()
    : [];
  const contentByUserGameId = new Map<string, string>();
  for (const row of reviews as Array<Record<string, unknown>>) {
    contentByUserGameId.set(String(row.userGameId), String(row.content ?? ""));
  }
  const games = userGames.map((ug: unknown) => {
    const raw = ug as Record<string, unknown>;
    const game = raw.gameId as Record<string, unknown> | null;
    return {
      id: String(raw._id),
      game: { name: String((game as Record<string, unknown>)?.name ?? "Unknown"), cover: (game as Record<string, unknown>)?.cover as string | undefined },
      status: raw.status as string,
      hoursPlayed: raw.hoursPlayed as number,
      timesFinished: raw.timesFinished as number,
      finished: (raw.finished as boolean) ?? false,
      favorite: (raw.favorite as boolean) ?? false,
      fullyCompleted: (raw.fullyCompleted as boolean) ?? false,
      achievements: (raw.achievements as boolean) ?? false,
      achievementProgress: raw.achievementProgress as number | null | undefined,
      achievementsCompleted: (raw.achievementsCompleted as boolean) ?? false,
      rating: raw.rating as number | null | undefined,
      review: contentByUserGameId.get(String(raw._id)) ?? "",
      collectionIds: ((raw.collectionIds as unknown[]) ?? []).map(String),
    };
  });
  return {
    exportedAt: new Date().toISOString(),
    user: { id: String(user._id), name: user.name, email: user.email },
    games,
    collections: collections.map((l) => ({ id: String(l._id), name: l.name })),
  };
}

export function exportToCsv(payload: ExportPayload): string {
  const headers = [
    "userId",
    "userEmail",
    "userName",
    "gameId",
    "gameName",
    "status",
    "hoursPlayed",
    "timesFinished",
    "finished",
    "favorite",
    "fullyCompleted",
    "achievements",
    "achievementProgress",
    "achievementsCompleted",
    "rating",
    "review",
    "collectionIds",
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const value = String(v);
    // Spreadsheet applications may execute a text cell as a formula when
    // its first meaningful character is =, +, -, or @. Treat leading Unicode
    // whitespace, C0/C1 controls, and BOM as ignorable by spreadsheet importers.
    // Numeric primitives remain numbers; this only changes untrusted strings.
    const s =
      typeof v === "string" && FORMULA_PREFIX.test(value)
        ? `'${value}`
        : value;
    if (
      s.includes(",") ||
      s.includes('"') ||
      s.includes("\n") ||
      s.includes("\r")
    ) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const rows = payload.games.map((g) =>
    [
      payload.user.id,
      payload.user.email,
      payload.user.name,
      g.id,
      g.game.name,
      g.status,
      g.hoursPlayed,
      g.timesFinished,
      g.finished,
      g.favorite,
      g.fullyCompleted,
      g.achievements,
      g.achievementProgress ?? "",
      g.achievementsCompleted,
      g.rating ?? "",
      g.review ?? "",
      g.collectionIds.join(";"),
    ]
      .map(escape)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
