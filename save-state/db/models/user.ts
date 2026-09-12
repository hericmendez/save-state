import "server-only";
import mongoose, { Schema } from "mongoose";
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
  createdAt: Date;
  updatedAt: Date;
}

export const User = defineModel<UserDocument>("User", UserSchema);
