import "server-only";
import mongoose, { Schema } from "mongoose";
import { defineModel } from "@/db/models";

const GameListSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true },
);

GameListSchema.index({ userId: 1, name: 1 }, { unique: true });

export interface GameListDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GameList = defineModel<GameListDocument>(
  "GameList",
  GameListSchema,
);
