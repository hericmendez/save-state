import "server-only";
import mongoose, { type Model, type Schema } from "mongoose";

/**
 * Define (or retrieve) a Mongoose model without triggering
 * `OverwriteModelError` under hot reload, server rendering,
 * Route Handlers, or repeated test imports.
 *
 * Domain models arrive in their own phases; this is the shared pattern.
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  if (existing) return existing;
  return mongoose.model<T>(name, schema);
}
