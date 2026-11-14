import "server-only";
import mongoose, { Schema } from "mongoose";
import { defineModel } from "@/db/models";

const EmailVerificationTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export interface EmailVerificationTokenDocument extends mongoose.Document {
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
}

export const EmailVerificationToken = defineModel<EmailVerificationTokenDocument>(
  "EmailVerificationToken", EmailVerificationTokenSchema,
);
