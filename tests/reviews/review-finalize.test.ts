/**
 * Phase 3 — draft finalization protocol (unit, no IndexedDB).
 *
 * Covers quiescence (stable/unstable), missing drafts, empty and over-long
 * content, and the post-commit conditional cleanup (delete only on
 * revision match, never throwing into the success path).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupDraftAfterSuccess,
  finalizeDraftForSubmit,
} from "@/features/reviews/review-finalize";
import type { ReviewDraft } from "@/features/reviews/editor-types";

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    draftId: "d1",
    userId: "u1",
    content: "conteúdo",
    revision: 3,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe("finalizeDraftForSubmit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves agreed content without waiting when already stable", async () => {
    const row = draft();
    const read = vi.fn(async () => row);
    const outcome = await finalizeDraftForSubmit({
      draftId: "d1",
      userId: "u1",
      read,
      roundDelayMs: 650,
      stableRounds: 1,
      maxRounds: 4,
      wait: async () => {},
    });
    expect(outcome).toEqual({
      kind: "content",
      markdown: "conteúdo",
      draftId: "d1",
      revision: 3,
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("waits past the debounce and uses the settled revision", async () => {
    const reads = [draft({ content: "v1", revision: 3 }), draft({ content: "v2", revision: 4 }), draft({ content: "v2", revision: 4 })];
    const read = vi.fn(async () => reads.shift() ?? draft());
    const outcome = await finalizeDraftForSubmit({
      draftId: "d1",
      userId: "u1",
      read,
      roundDelayMs: 650,
      wait: async () => {},
    });
    expect(outcome).toMatchObject({ kind: "content", revision: 4, markdown: "v2" });
  });

  it("aborts as unstable when the draft keeps changing", async () => {
    let revision = 1;
    const read = vi.fn(async () => draft({ revision: revision++, updatedAt: revision }));
    const outcome = await finalizeDraftForSubmit({
      draftId: "d1",
      userId: "u1",
      read,
      maxRounds: 3,
      wait: async () => {},
    });
    expect(outcome).toMatchObject({ kind: "unstable", draftId: "d1" });
  });

  it("maps missing drafts and empty content explicitly", async () => {
    const missing = await finalizeDraftForSubmit({
      draftId: "nope",
      userId: "u1",
      read: async () => null,
      stableRounds: 1,
      wait: async () => {},
    });
    expect(missing).toEqual({ kind: "missing" });

    const empty = await finalizeDraftForSubmit({
      draftId: "d1",
      userId: "u1",
      read: async () => draft({ content: "   \n  " }),
      stableRounds: 1,
      wait: async () => {},
    });
    expect(empty).toEqual({ kind: "absent" });
  });

  it("rejects over-long drafts before any HTTP request", async () => {
    const outcome = await finalizeDraftForSubmit({
      draftId: "d1",
      userId: "u1",
      read: async () => draft({ content: "x".repeat(20001) }),
      stableRounds: 1,
      wait: async () => {},
    });
    expect(outcome).toEqual({ kind: "too-long", length: 20001 });
  });
});

describe("cleanupDraftAfterSuccess", () => {
  it("deletes only on revision match", async () => {
    const row = draft({ revision: 4 });
    const remove = vi.fn(async () => true);
    const outcome = await cleanupDraftAfterSuccess({
      draftId: "d1",
      userId: "u1",
      submittedRevision: 4,
      read: async () => row,
      remove,
    });
    expect(outcome).toEqual({ kind: "deleted", draftId: "d1" });
    expect(remove).toHaveBeenCalledWith("d1", "u1");
  });

  it("preserves drafts changed during submit (no silent wipe)", async () => {
    const remove = vi.fn(async () => true);
    const outcome = await cleanupDraftAfterSuccess({
      draftId: "d1",
      userId: "u1",
      submittedRevision: 4,
      read: async () => draft({ revision: 5 }),
      remove,
    });
    expect(outcome).toMatchObject({ kind: "kept-changed", revision: 5 });
    expect(remove).not.toHaveBeenCalled();
  });

  it("never throws: missing drafts and delete failures are outcomes", async () => {
    const missing = await cleanupDraftAfterSuccess({
      draftId: "d1",
      userId: "u1",
      submittedRevision: 4,
      read: async () => null,
      remove: async () => true,
    });
    expect(missing).toEqual({ kind: "kept-missing", draftId: "d1" });

    const failed = await cleanupDraftAfterSuccess({
      draftId: "d1",
      userId: "u1",
      submittedRevision: 4,
      read: async () => draft({ revision: 4 }),
      remove: async () => false,
    });
    expect(failed).toEqual({ kind: "delete-failed", draftId: "d1" });

    const throwing = await cleanupDraftAfterSuccess({
      draftId: "d1",
      userId: "u1",
      submittedRevision: 4,
      read: async () => {
        throw new Error("idb down");
      },
      remove: async () => true,
    });
    expect(throwing).toEqual({ kind: "kept-missing", draftId: "d1" });
  });
});
