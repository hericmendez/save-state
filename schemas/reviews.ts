import { z } from "zod";

/**
 * Review contracts — Phase 1 (backend only).
 *
 * - Full Markdown lives in GameReview.content (max 20000, same as legacy).
 * - UserGame.reviewExcerpt is derived, ~250 chars, plain text.
 * - Legacy `review: string` writes remain accepted for compatibility and
 *   are mirrored into GameReview (see server/games/service.ts).
 */

export const REVIEW_CONTENT_MAX_LENGTH = 20000;
export const REVIEW_EXCERPT_MAX_LENGTH = 250;

export const reviewContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(REVIEW_CONTENT_MAX_LENGTH);

export const reviewObjectSchema = z.object({
  content: reviewContentSchema,
});

/** Legacy plain-string input (kept for compatibility). */
export const reviewLegacyStringSchema = z
  .string()
  .trim()
  .max(REVIEW_CONTENT_MAX_LENGTH);

/** Create: absent | legacy string | { content } */
export const reviewCreateInputSchema = z.union([
  reviewLegacyStringSchema,
  reviewObjectSchema,
]);

/** Update: absent | legacy string | { content } | null (remove) */
export const reviewUpdateInputSchema = z.union([
  reviewLegacyStringSchema,
  reviewObjectSchema,
  z.null(),
]);

export type ReviewCreateInput = z.infer<typeof reviewCreateInputSchema>;
export type ReviewUpdateInput = z.infer<typeof reviewUpdateInputSchema>;
export type ReviewObjectInput = z.infer<typeof reviewObjectSchema>;

export type NormalizedReviewInput =
  | { kind: "absent" }
  | { kind: "clear" }
  | { kind: "content"; content: string; source: "legacy" | "object" };

/**
 * Normalize the union input (string | { content } | null | undefined)
 * into an explicit action.
 *
 * - `undefined` → absent (do not touch the review).
 * - `null` → clear (remove GameReview, clear legacy + excerpt).
 * - `""`/whitespace → legacy empty content (preserves old storage
 *   behavior on UserGame.review; never creates a GameReview).
 * - non-empty string → legacy content (mirrored into GameReview).
 * - `{ content }` → rich content (GameReview + excerpt + legacy mirror).
 */
export function normalizeReviewInput(value: unknown): NormalizedReviewInput {
  if (value === undefined) return { kind: "absent" };
  if (value === null) return { kind: "clear" };
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0)
      return { kind: "content", content: "", source: "legacy" };
    return { kind: "content", content: trimmed, source: "legacy" };
  }
  if (typeof value === "object" && value !== null && "content" in value) {
    const content = (value as { content: unknown }).content;
    if (typeof content !== "string") return { kind: "absent" };
    return { kind: "content", content: content.trim(), source: "object" };
  }
  return { kind: "absent" };
}
