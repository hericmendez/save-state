import "server-only";
import { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { connectDatabase } from "@/db/connection";
import { UserGame } from "@/db/models/user-game";
import { GameReview, type GameReviewDocument } from "@/db/models/game-review";
import { buildReviewExcerpt } from "@/server/reviews/excerpt";

/**
 * Review read/write helpers owned by the reviews domain.
 * Ownership is ALWAYS resolved through the parent UserGame, never from
 * the GameReview alone (same rule as notes).
 */

export interface ReviewDTO {
  content: string;
  excerpt: string;
  source: "review" | "legacy";
  createdAt: Date | null;
  updatedAt: Date | null;
}

async function findOwnedUserGameOrThrow(userId: string, gameId: string) {
  let userGame;
  try {
    userGame = await UserGame.findOne({
      _id: gameId,
      userId: new Types.ObjectId(userId),
    });
  } catch {
    throw new ApiError("INVALID_GAME_ID", "Invalid game id", 400);
  }
  if (!userGame) {
    throw new ApiError("GAME_NOT_FOUND", "Game not found", 404);
  }
  return userGame;
}

/**
 * On-demand full-content read. GameReview wins when present; otherwise the
 * legacy UserGame.review is served (source: "legacy") so old clients keep
 * working during the transition. Neither → REVIEW_NOT_FOUND (404).
 *
 * Normalization note (M9): the endpoint returns TRIMMED content in both
 * branches, while the database preserves the original stored value untouched.
 * Rationale: Mongoose `trim: true` already normalizes on write, so stored
 * values are trimmed in practice; the trim here only guards pre-existing
 * rows written before `trim` existed. `excerpt` is always derived from the
 * trimmed text, so `content`/`excerpt` never disagree on whitespace.
 */
export async function getReview(
  userId: string,
  gameId: string,
): Promise<ReviewDTO> {
  await connectDatabase();
  const userGame = await findOwnedUserGameOrThrow(userId, gameId);
  const review: GameReviewDocument | null = await GameReview.findOne({
    userGameId: userGame._id,
  });
  if (review) {
    const content = review.content.trim();
    return {
      content,
      excerpt: buildReviewExcerpt(content),
      source: "review",
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
  const legacy =
    typeof userGame.review === "string" ? userGame.review.trim() : "";
  if (legacy.length > 0) {
    return {
      content: legacy,
      excerpt: buildReviewExcerpt(legacy),
      source: "legacy",
      createdAt: null,
      updatedAt: null,
    };
  }
  throw new ApiError("REVIEW_NOT_FOUND", "Review not found", 404);
}

export async function deleteReviewsForUserGame(
  userGameId: Types.ObjectId,
  session?: ClientSession,
): Promise<void> {
  if (session) {
    await GameReview.deleteMany({ userGameId }, { session });
    return;
  }
  await GameReview.deleteMany({ userGameId });
}
