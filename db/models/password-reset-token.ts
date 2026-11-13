import "server-only";
import mongoose, { Schema } from "mongoose";
import { defineModel } from "@/db/models";

const PasswordResetTokenSchema = new Schema(
  {
    tokenHash: {
      type: String,
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
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    used: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export interface PasswordResetTokenDocument extends mongoose.Document {
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const PasswordResetToken = defineModel<PasswordResetTokenDocument>(
  "PasswordResetToken",
  PasswordResetTokenSchema,
);
