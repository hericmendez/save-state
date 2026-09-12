import "server-only";
import mongoose, { Schema } from "mongoose";
import { defineModel } from "@/db/models";

const GlobalGameSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      required: true,
      enum: ["manual", "atp"],
      default: "manual",
    },
    sourceUrl: { type: String, trim: true },
    cover: { type: String, trim: true },
    genres: { type: [String], default: [] },
    platforms: { type: [String], default: [] },
    developers: { type: [String], default: [] },
    publishers: { type: [String], default: [] },
    releaseDate: { type: Date },
    summary: { type: String, trim: true },
  },
  { timestamps: true },
);

GlobalGameSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { source: "manual" } },
);

export interface GlobalGameDocument extends mongoose.Document {
  slug: string;
  name: string;
  source: "manual" | "atp";
  sourceUrl?: string;
  cover?: string;
  genres: string[];
  platforms: string[];
  developers: string[];
  publishers: string[];
  releaseDate?: Date;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GlobalGame = defineModel<GlobalGameDocument>(
  "GlobalGame",
  GlobalGameSchema,
);
