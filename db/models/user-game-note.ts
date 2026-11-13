import "server-only";
import mongoose, { Schema, Types } from "mongoose";
import { defineModel } from "@/db/models";
import { NOTE_CONTENT_MAX_LENGTH } from "@/schemas/notes";

const UserGameNoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userGameId: {
      type: Schema.Types.ObjectId,
      ref: "UserGame",
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true, maxlength: NOTE_CONTENT_MAX_LENGTH },
  },
  { timestamps: true },
);

UserGameNoteSchema.index({ userGameId: 1, createdAt: -1 });
UserGameNoteSchema.index({ userId: 1, createdAt: -1 });

export interface UserGameNoteDocument extends mongoose.Document {
  userId: Types.ObjectId;
  userGameId: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserGameNote = defineModel<UserGameNoteDocument>(
  "UserGameNote",
  UserGameNoteSchema,
);
