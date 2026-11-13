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
  source: "review";
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
 * On-demand full-content read from GameReview (single source of truth).
 * Throws REVIEW_NOT_FOUND (404) when no review exists.
 *
 * Normalization note (M9): the endpoint returns TRIMMED content, while the
 * database preserves the original stored value untouched. `excerpt` is
 * always derived from the trimmed text, so `content`/`excerpt` never
 * disagree on whitespace.
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
  if (!review) {
    throw new ApiError("REVIEW_NOT_FOUND", "Review not found", 404);
  }
  const content = review.content.trim();
  return {
    content,
    excerpt: buildReviewExcerpt(content),
    source: "review",
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
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
