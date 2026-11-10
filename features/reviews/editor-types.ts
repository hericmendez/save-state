/**
 * Review Editor — shared types (Phase 2).
 *
 * Client-safe: no DOM, no IndexedDB, no server imports. Unit-tested in
 * `tests/reviews/review-drafts.test.ts`.
 */

/** Local draft persisted in IndexedDB. Never sent to the server in Phase 2. */
export interface ReviewDraft {
  /** UUID v4, independent from any gameId. */
  draftId: string;
  /** Owner — always the authenticated session user, never from the URL. */
  userId: string;
  /** Optional link to a UserGame being reviewed. */
  userGameId?: string;
  /** Display-only snapshot of the game name (never authoritative). */
  gameName?: string;
  /** Canonical Markdown content. */
  content: string;
  /** Optimistic-concurrency revision. Starts at 1, +1 per confirmed write. */
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type ReviewDraftCreateInput = Pick<
  ReviewDraft,
  "userId" | "content"
> &
  Partial<Pick<ReviewDraft, "userGameId" | "gameName">>;

export type ReviewDraftPatch = Partial<
  Pick<ReviewDraft, "content" | "userGameId" | "gameName">
>;

/** Visible autosave state. "saved" means persisted LOCALLY, never on MongoDB. */
export type DraftSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "conflict"
  | "error"
  | "session-expired"
  | "storage-unavailable";

export type ReviewEditorMode = "visual" | "markdown" | "preview";

/** Entry modes for `/reviews/editor`, resolved from search params. */
export type ReviewEditorEntry =
  | { kind: "empty" }
  | { kind: "draft"; draftId: string }
  | { kind: "game"; userGameId: string }
  | { kind: "ambiguous" };

/**
 * Cross-tab notification. The payload carries NO Markdown — IndexedDB is
 * the source of truth; receivers re-read from it.
 */
export interface ReviewDraftUpdatedMessage {
  type: "draft-updated";
  draftId: string;
  revision: number;
  updatedAt: number;
}

/** Thrown by `updateDraft` when `expectedRevision` no longer matches. */
export class DraftConflictError extends Error {
  readonly persisted: ReviewDraft;
  constructor(persisted: ReviewDraft) {
    super(
      `Draft conflict: expected an older revision, persisted is r${persisted.revision}`,
    );
    this.name = "DraftConflictError";
    this.persisted = persisted;
  }
}

/** Thrown by `updateDraft` when the draft is missing or owned by another user. */
export class DraftNotFoundError extends Error {
  constructor(draftId: string) {
    super(`Draft not found: ${draftId}`);
    this.name = "DraftNotFoundError";
  }
}
