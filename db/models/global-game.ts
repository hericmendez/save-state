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
      enum: ["manual", "atp", "igdb"],
      default: "manual",
    },
    sourceUrl: { type: String, trim: true },
    // Canonical ATP identity. Additive and optional: manual games never set
    // it; imported ATP games must set it. Sparse unique index is the
    // database-level invariant against duplicate canonical records.
    atpDomainId: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
    },
    // Canonical IGDB identity. Same additive/sparse semantics as
    // atpDomainId: only IGDB imports set it, never null (absent field),
    // so legacy documents without it remain valid and conflict-free.
    igdbId: {
      type: Number,
      index: { unique: true, sparse: true },
    },
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
  source: "manual" | "atp" | "igdb";
  sourceUrl?: string;
  atpDomainId?: string;
  igdbId?: number;
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
