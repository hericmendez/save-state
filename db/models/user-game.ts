import "server-only";
import mongoose, { Schema, Types } from "mongoose";
import { defineModel } from "@/db/models";
import { GAME_STATUSES, type GameStatus } from "@/schemas/games";

const UserGameSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    gameId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalGame",
      required: true,
      index: true,
    },
    status: { type: String, enum: GAME_STATUSES, default: "backlog" },
    hoursPlayed: { type: Number, default: 0, min: 0 },
    timesFinished: { type: Number, default: 0, min: 0 },
    // Date of the most recent explicitly recorded completion. Set only by
    // completion transitions (updateGame unfinished→finished,
    // incrementTimesFinished) in the same write as the state change —
    // never from updatedAt/createdAt, never for manual counter edits, and
    // never at creation (a game created already finished has no real
    // completion date). Null until the first recorded completion.
    lastFinishedAt: { type: Date, default: null },
    rating: { type: Number, min: 0, max: 10 },
    review: { type: String, trim: true },
    // Derived plain-text preview of GameReview.content (~250 chars).
    // Written ONLY by the server (never by clients). Legacy `review`
    // stays as the transitional mirror; the full Markdown lives in
    // GameReview. No `hasReview` flag (presence of GameReview/excerpt
    // is the signal — avoids redundancy).
    reviewExcerpt: { type: String, trim: true, maxlength: 500 },
    collectionIds: [{ type: Schema.Types.ObjectId, ref: "GameCollection" }],
    favorite: { type: Boolean, default: false, index: true },
    finished: { type: Boolean, default: false, index: true },
    fullyCompleted: { type: Boolean, default: false, index: true },
    achievements: { type: Boolean, default: false },
    achievementProgress: { type: Number, min: 0, max: 100 },
    achievementsCompleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

UserGameSchema.index({ userId: 1, gameId: 1 }, { unique: true });
UserGameSchema.index({ userId: 1, lastFinishedAt: -1 });

export interface UserGameDocument extends mongoose.Document {
  userId: Types.ObjectId;
  gameId: Types.ObjectId;
  status: GameStatus;
  hoursPlayed: number;
  timesFinished: number;
  lastFinishedAt: Date | null;
  rating?: number;
  review?: string;
  reviewExcerpt?: string;
  collectionIds: Types.ObjectId[];
  favorite: boolean;
  finished: boolean;
  fullyCompleted: boolean;
  achievements: boolean;
  achievementProgress?: number;
  achievementsCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const UserGame = defineModel<UserGameDocument>(
  "UserGame",
  UserGameSchema,
);
