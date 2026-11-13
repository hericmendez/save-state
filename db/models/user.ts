import "server-only";
import mongoose, { Schema, Types } from "mongoose";
import { defineModel } from "@/db/models";

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    sessionVersion: {
      type: Number,
      default: 0,
    },
    emailVerifiedAt: { type: Date, default: null },
    top10: {
      type: [{ type: Schema.Types.ObjectId, ref: "UserGame" }],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export interface UserDocument extends mongoose.Document {
  name: string;
  email: string;
  passwordHash: string;
  sessionVersion: number;
  emailVerifiedAt: Date | null;
  top10: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export const User = defineModel<UserDocument>("User", UserSchema);
