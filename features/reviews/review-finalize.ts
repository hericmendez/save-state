/**
 * Phase 3 — safe draft finalization for form submit.
 *
 * There is NO distributed atomicity between IndexedDB and MongoDB, and this
 * module never claims it. The protocol only narrows the race:
 *
 * 1. Read the draft (revision R1, content C1).
 * 2. Wait past the editor autosave debounce, read again (R2, C2).
 * 3. Repeat until two consecutive reads agree (bounded rounds). If the
 *    draft keeps changing (user actively typing in another tab), abort
 *    with `unstable` instead of guessing — the caller surfaces a message
 *    asking the user to pause/reconcile.
 * 4. The caller builds ONE HTTP request from the agreed content.
 * 5. After backend success, `cleanupDraftAfterSuccess` re-reads: only when
 *    the revision is still the submitted one is the draft deleted. A newer
 *    revision means another tab wrote during/after submit — the draft is
 *    PRESERVED for reconciliation, never wiped by a stale finalizer.
 * 6. Failures never delete anything; nothing is cleaned in `finally`.
 *
 * All storage access is injected, so unit tests run without IndexedDB.
 */
import type { ReviewDraft } from "./editor-types";
import { REVIEW_DRAFT_MAX_LENGTH } from "./editor-markdown";

export interface DraftReader {
  (draftId: string, userId: string): Promise<ReviewDraft | null>;
}

export interface DraftDeleter {
  (draftId: string, userId: string): Promise<boolean>;
}

export type FinalizeOutcome =
  | { kind: "absent" }
  | { kind: "content"; markdown: string; draftId: string; revision: number }
  | { kind: "missing" }
  | { kind: "unstable"; draftId: string; lastRevision: number }
  | { kind: "too-long"; length: number };

export interface FinalizeOptions {
  draftId: string;
  userId: string;
  read: DraftReader;
  /** Delay between agreement rounds (must exceed the editor debounce). */
  roundDelayMs?: number;
  /** Consecutive agreeing reads required. */
  stableRounds?: number;
  /** Hard cap on read rounds before giving up as unstable. */
  maxRounds?: number;
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolve the submittable Markdown for a linked draft.
 *
 * - Missing draft (deleted elsewhere) → `missing` (caller treats as absent
 *   for create, or aborts for edit — never invents content).
 * - Empty/whitespace content → `absent` (never submit empty Markdown as a
 *   valid review; explicit removal uses the `clear` form value instead).
 * - Over-limit content → `too-long` (backend would reject with 422).
 * - Keeps changing → `unstable` (caller asks the user to pause/reconcile).
 */
export async function finalizeDraftForSubmit(
  options: FinalizeOptions,
): Promise<FinalizeOutcome> {
  const {
    draftId,
    userId,
    read,
    roundDelayMs = 650,
    stableRounds = 2,
    maxRounds = 4,
    wait = sleep,
  } = options;

  let previous: ReviewDraft | null = null;
  let agreeing = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    const current = await read(draftId, userId);
    if (!current) return { kind: "missing" };
    if (
      previous &&
      current.revision === previous.revision &&
      current.content === previous.content &&
      current.updatedAt === previous.updatedAt
    ) {
      agreeing += 1;
    } else {
      agreeing = 1;
    }
    previous = current;
    if (agreeing >= stableRounds) {
      const markdown = current.content.trim();
      if (markdown.length === 0) return { kind: "absent" };
      if (markdown.length > REVIEW_DRAFT_MAX_LENGTH) {
        return { kind: "too-long", length: markdown.length };
      }
      return {
        kind: "content",
        markdown: current.content,
        draftId: current.draftId,
        revision: current.revision,
      };
    }
    await wait(roundDelayMs);
  }
  return {
    kind: "unstable",
    draftId,
    lastRevision: previous?.revision ?? -1,
  };
}

export type CleanupOutcome =
  | { kind: "deleted"; draftId: string }
  | { kind: "kept-changed"; draftId: string; revision: number }
  | { kind: "kept-missing"; draftId: string }
  | { kind: "delete-failed"; draftId: string };

/**
 * Post-commit cleanup. Deletes ONLY when the persisted revision still
 * matches the submitted one. Never throws into the success path: the
 * server already committed, so a kept draft is reconciled via the
 * recovery UI instead of duplicating the review.
 */
export async function cleanupDraftAfterSuccess(args: {
  draftId: string;
  userId: string;
  submittedRevision: number;
  read: DraftReader;
  remove: DraftDeleter;
}): Promise<CleanupOutcome> {
  const current = await args
    .read(args.draftId, args.userId)
    .catch(() => null);
  if (!current) return { kind: "kept-missing", draftId: args.draftId };
  if (current.revision !== args.submittedRevision) {
    return {
      kind: "kept-changed",
      draftId: args.draftId,
      revision: current.revision,
    };
  }
  const deleted = await args
    .remove(args.draftId, args.userId)
    .catch(() => false);
  if (!deleted) return { kind: "delete-failed", draftId: args.draftId };
  return { kind: "deleted", draftId: args.draftId };
}
