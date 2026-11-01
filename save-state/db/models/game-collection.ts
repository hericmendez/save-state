import "server-only";
import mongoose, { Schema } from "mongoose";
import { defineModel } from "@/db/models";

const GameCollectionSchema = new Schema(
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

GameCollectionSchema.index({ userId: 1, name: 1 }, { unique: true });

export interface GameCollectionDocument extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GameCollection = defineModel<GameCollectionDocument>(
  "GameCollection",
  GameCollectionSchema,
);
