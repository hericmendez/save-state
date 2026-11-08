import "server-only";
import mongoose, { Schema, Types } from "mongoose";
import { defineModel } from "@/db/models";
import { REVIEW_CONTENT_MAX_LENGTH } from "@/schemas/reviews";

/**
 * GameReview — full Markdown review body (Phase 1).
 *
 * Optional 1:1 with UserGame (`userGameId` unique). The complete Markdown
 * lives ONLY here; `UserGame.reviewExcerpt` carries the derived preview and
 * `UserGame.review` remains as the legacy mirror during the transition.
 */
const GameReviewSchema = new Schema(
  {
    userGameId: {
      type: Schema.Types.ObjectId,
      ref: "UserGame",
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: REVIEW_CONTENT_MAX_LENGTH,
    },
  },
  { timestamps: true },
);

GameReviewSchema.index({ userId: 1, updatedAt: -1 });

export interface GameReviewDocument extends mongoose.Document {
  userGameId: Types.ObjectId;
  userId: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GameReview = defineModel<GameReviewDocument>(
  "GameReview",
  GameReviewSchema,
);
