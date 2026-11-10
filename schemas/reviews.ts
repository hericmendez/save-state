import { z } from "zod";

/**
 * Review contracts — definitive (Phase 4: legacy removed).
 *
 * - Full Markdown lives ONLY in GameReview.content (max 20000).
 * - UserGame.reviewExcerpt is derived, ~250 chars, plain text.
 * - UserGame.review (legacy mirror) no longer exists.
 *
 * Wire contract:
 * - absent → do not touch GameReview.
 * - `{ content }` (non-empty) → create or update GameReview + excerpt.
 * - `null` (update only) → remove GameReview + excerpt.
 *
 * Plain strings are rejected at the schema boundary (400); the normalizer
 * below treats any non-object input defensively as absent/clear/undefined
 * semantics — never persisting unvalidated content.
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

/** Create: absent | { content } */
export const reviewCreateInputSchema = reviewObjectSchema;

/** Update: absent | { content } | null (remove) */
export const reviewUpdateInputSchema = z.union([reviewObjectSchema, z.null()]);

export type ReviewCreateInput = z.infer<typeof reviewCreateInputSchema>;
export type ReviewUpdateInput = z.infer<typeof reviewUpdateInputSchema>;
export type ReviewObjectInput = z.infer<typeof reviewObjectSchema>;

export type NormalizedReviewInput =
  | { kind: "absent" }
  | { kind: "clear" }
  | { kind: "content"; content: string };

/**
 * Normalize the union input (`{ content }` | null | undefined) into an
 * explicit action.
 *
 * - `undefined` → absent (do not touch the review).
 * - `null` → clear (remove GameReview + excerpt).
 * - `{ content }` → content (GameReview + excerpt).
 * - anything else → absent (schemas reject it with 400 first).
 */
export function normalizeReviewInput(value: unknown): NormalizedReviewInput {
  if (value === undefined) return { kind: "absent" };
  if (value === null) return { kind: "clear" };
  if (typeof value === "object" && value !== null && "content" in value) {
    const content = (value as { content: unknown }).content;
    if (typeof content !== "string") return { kind: "absent" };
    return { kind: "content", content: content.trim() };
  }
  return { kind: "absent" };
}
