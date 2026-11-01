import "server-only";
import mongoose, { Schema, Types } from "mongoose";
import { defineModel } from "@/db/models";
import { ACTIVITY_TYPES, type ActivityType } from "@/schemas/activity";

const GameSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    cover: { type: String, trim: true },
  },
  { _id: false },
);

const ListSnapshotSchema = new Schema(
  {
    // Frozen string snapshot, not a live reference: history must survive
    // the deletion of the list itself.
    listId: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const CollectionSnapshotSchema = new Schema(
  {
    // Same frozen-snapshot semantics as lists; kept as a separate key so
    // historic list.* events stay byte-identical.
    collectionId: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ActivitySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, required: true, enum: ACTIVITY_TYPES },
    userGameId: { type: Schema.Types.ObjectId, ref: "UserGame" },
    game: { type: GameSnapshotSchema, required: false },
    list: { type: ListSnapshotSchema, required: false },
    collection: { type: CollectionSnapshotSchema, required: false },
    metadata: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  {
    // Append-only diary: creation time is the event time. No `updatedAt`
    // by convention — activities are never edited.
    timestamps: { updatedAt: false, createdAt: true },
    // Empty `metadata: {}` is meaningful (event without parameters) and
    // must survive persistence instead of being stripped as "empty".
    minimize: false,
    // `collection` is a reserved Mongoose pathname; verified empirically
    // that the schema path wins on hydrated docs (snapshot reads fine).
    // The warning is noise for this deliberate domain name.
    suppressReservedKeysWarning: true,
  },
);

// Feed reads: owner + reverse-chronological order.
ActivitySchema.index({ userId: 1, createdAt: -1 });
// Cursor pagination: owner + physical order with `_id` tiebreak, so
// same-millisecond events never need an in-memory sort.
ActivitySchema.index({ userId: 1, createdAt: -1, _id: -1 });
// Filtered reads: owner + type + reverse-chronological order.
ActivitySchema.index({ userId: 1, type: 1, createdAt: -1 });
// Per-game history: owner + game + reverse-chronological order.
ActivitySchema.index({ userId: 1, userGameId: 1, createdAt: -1 });

export interface ActivityDocument
  extends Omit<mongoose.Document, "collection"> {
  userId: Types.ObjectId;
  type: ActivityType;
  userGameId?: Types.ObjectId;
  game?: { name: string; cover?: string };
  list?: { listId?: string; name: string };
  // `collection` collides with mongoose.Document's own collection handle;
  // Omit above keeps the snapshot path typed as domain data.
  collection?: { collectionId?: string; name: string };
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export const Activity = defineModel<ActivityDocument>(
  "Activity",
  ActivitySchema,
);
