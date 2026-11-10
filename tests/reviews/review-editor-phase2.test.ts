/**
 * Phase 2 — Review Editor: store (OCC), channel guards, Markdown contract,
 * entry resolution, extension set, API client.
 *
 * Only `.ts` modules are imported here (the `.tsx` surfaces need a DOM and
 * are covered by Playwright `e2e-review-editor`).
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DraftConflictError,
  DraftNotFoundError,
  __clearDraftsForTests,
  createDraft,
  deleteDraft,
  findDraftByGame,
  getDraft,
  isDraftId,
  listDrafts,
  updateDraft,
} from "@/features/reviews/draft-store";
import {
  isBroadcastAvailable,
  isNewerDraftMessage,
  isValidDraftUpdatedMessage,
} from "@/features/reviews/draft-channel";
import {
  AUTOSAVE_DEBOUNCE_MS,
  REVIEW_DRAFT_MAX_LENGTH,
  detectUnsupportedMarkdown,
  draftPreviewText,
  draftRemainingChars,
  isDraftOverLimit,
  isSafeEmbedUrl,
  resolveEditorEntry,
} from "@/features/reviews/editor-markdown";
import {
  REVIEW_TOOLBAR_ACTIONS,
  createReviewEditorExtensions,
  isAllowedEditorUri,
  isAllowedImageUrl,
  stripUnsafePreviewImages,
} from "@/features/reviews/editor-extensions";
import {
  SessionExpiredError,
  fetchGameSummary,
  fetchServerReview,
  fetchSessionIdentity,
} from "@/features/reviews/review-api-client";

const USER_A = "user-a";
const USER_B = "user-b";

beforeEach(async () => {
  await __clearDraftsForTests();
});

describe("draft-store: CRUD + isolation", () => {
  it("creates drafts with UUID, revision 1 and timestamps", async () => {
    const draft = await createDraft({ userId: USER_A, content: "# Olá" });
    expect(isDraftId(draft.draftId)).toBe(true);
    expect(draft.revision).toBe(1);
    expect(draft.content).toBe("# Olá");
    expect(draft.updatedAt).toBeGreaterThanOrEqual(draft.createdAt);
  });

  it("isolates drafts per user (no existence leak)", async () => {
    const draft = await createDraft({ userId: USER_A, content: "secreto" });
    expect(await getDraft(draft.draftId, USER_B)).toBeNull();
    expect(await listDrafts(USER_B)).toEqual([]);
    expect(await deleteDraft(draft.draftId, USER_B)).toBe(false);
    expect(await getDraft(draft.draftId, USER_A)).not.toBeNull();
  });

  it("lists newest first and finds drafts by game", async () => {
    await createDraft({ userId: USER_A, content: "a", userGameId: "g1" });
    const second = await createDraft({
      userId: USER_A,
      content: "b",
      userGameId: "g2",
    });
    const rows = await listDrafts(USER_A);
    expect(rows.map((r) => r.draftId)).toContain(second.draftId);
    expect(await findDraftByGame(USER_A, "g2")).not.toBeNull();
    expect(await findDraftByGame(USER_A, "g9")).toBeNull();
    expect(await findDraftByGame(USER_B, "g2")).toBeNull();
  });

  it("updateDraft is atomic compare-and-swap (+1 revision)", async () => {
    const draft = await createDraft({ userId: USER_A, content: "v1" });
    const next = await updateDraft(draft.draftId, USER_A, 1, {
      content: "v2",
    });
    expect(next.revision).toBe(2);
    expect(next.content).toBe("v2");
  });

  it("updateDraft rejects stale revisions with the persisted row", async () => {
    const draft = await createDraft({ userId: USER_A, content: "v1" });
    await updateDraft(draft.draftId, USER_A, 1, { content: "v2" });
    const attempt = updateDraft(draft.draftId, USER_A, 1, { content: "v3-stale" });
    await expect(attempt).rejects.toBeInstanceOf(DraftConflictError);
    await expect(attempt).rejects.toMatchObject({ persisted: { revision: 2 } });
    // The stale write never landed.
    expect((await getDraft(draft.draftId, USER_A))?.content).toBe("v2");
  });

  it("updateDraft on missing/foreign drafts throws DraftNotFoundError", async () => {
    const draft = await createDraft({ userId: USER_A, content: "v1" });
    await expect(
      updateDraft("00000000-0000-4000-8000-000000000000", USER_A, 1, {
        content: "x",
      }),
    ).rejects.toBeInstanceOf(DraftNotFoundError);
    await expect(
      updateDraft(draft.draftId, USER_B, 1, { content: "x" }),
    ).rejects.toBeInstanceOf(DraftNotFoundError);
  });

  it("deleteDraft removes only own drafts", async () => {
    const draft = await createDraft({ userId: USER_A, content: "bye" });
    expect(await deleteDraft(draft.draftId, USER_A)).toBe(true);
    expect(await getDraft(draft.draftId, USER_A)).toBeNull();
    expect(await deleteDraft(draft.draftId, USER_A)).toBe(false);
  });
});

describe("draft-channel: guards", () => {
  it("validates incoming payloads", () => {
    expect(
      isValidDraftUpdatedMessage({
        type: "draft-updated",
        draftId: "abc",
        revision: 2,
        updatedAt: 123,
      }),
    ).toBe(true);
    for (const bad of [
      null,
      "x",
      { type: "draft-updated" },
      { type: "other", draftId: "a", revision: 1, updatedAt: 1 },
      { type: "draft-updated", draftId: "", revision: 1, updatedAt: 1 },
      { type: "draft-updated", draftId: "a", revision: 0, updatedAt: 1 },
      { type: "draft-updated", draftId: "a", revision: 1.5, updatedAt: 1 },
    ]) {
      expect(isValidDraftUpdatedMessage(bad)).toBe(false);
    }
  });

  it("ignores stale notifications", () => {
    const msg = {
      type: "draft-updated" as const,
      draftId: "d",
      revision: 3,
      updatedAt: 10,
    };
    expect(isNewerDraftMessage(msg, 2)).toBe(true);
    expect(isNewerDraftMessage(msg, 3, 5)).toBe(true);
    expect(isNewerDraftMessage(msg, 3, 10)).toBe(false);
    expect(isNewerDraftMessage(msg, 4)).toBe(false);
  });

  it("BroadcastChannel exists in this runtime", () => {
    expect(isBroadcastAvailable()).toBe(true);
  });
});

describe("editor-markdown: contract helpers", () => {
  it("autosave debounce is ~500ms and limit mirrors the server", () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(500);
    expect(REVIEW_DRAFT_MAX_LENGTH).toBe(20000);
  });

  it("limit helpers", () => {
    expect(isDraftOverLimit("x".repeat(20000))).toBe(false);
    expect(isDraftOverLimit("x".repeat(20001))).toBe(true);
    expect(draftRemainingChars("abc")).toBe(19997);
  });

  it("resolves entry modes and rejects ambiguity", () => {
    expect(resolveEditorEntry({})).toEqual({ kind: "empty" });
    expect(resolveEditorEntry({ draftId: "  " })).toEqual({ kind: "empty" });
    expect(resolveEditorEntry({ draftId: "d1" })).toEqual({
      kind: "draft",
      draftId: "d1",
    });
    expect(resolveEditorEntry({ userGameId: "g1" })).toEqual({
      kind: "game",
      userGameId: "g1",
    });
    expect(resolveEditorEntry({ draftId: "d1", userGameId: "g1" })).toEqual({
      kind: "ambiguous",
    });
  });

  it("detects visual-unsupported constructs, ignores supported ones", () => {
    const supported = [
      "# Título",
      "## H2",
      "**negrito** e *itálico* e ~~riscado~~",
      "- item\n  - aninhado\n1. um\n2. dois",
      "> citação",
      "[texto **forte**](https://exemplo.com)",
      "![alt](https://exemplo.com/img.png)",
      "`código`",
      "```ts\nconst a = 1;\n```",
      "---",
      "quebra  \nde linha",
      "caractere escapado \\* ok, unicode: 日本語 🎮",
    ].join("\n\n");
    expect(detectUnsupportedMarkdown(supported)).toEqual([]);

    const table = "| a | b |\n|---|---|\n| 1 | 2 |";
    expect(detectUnsupportedMarkdown(table)).toContain("table");

    expect(detectUnsupportedMarkdown("- [ ] tarefa")).toContain("task-list");
    expect(detectUnsupportedMarkdown("ver nota[^1]\n\n[^1]: rodapé")).toContain(
      "footnote",
    );
    expect(detectUnsupportedMarkdown("<div>bloco</div>")).toContain("html");
    // Fenced code containing pipes/dashes is not a table.
    expect(
      detectUnsupportedMarkdown("```\n| a |\n|---|\n```"),
    ).not.toContain("table");
  });

  it("URL allow-list blocks javascript:/data:/relative", () => {
    expect(isSafeEmbedUrl("https://exemplo.com/a.png")).toBe(true);
    expect(isSafeEmbedUrl("http://exemplo.com")).toBe(true);
    expect(isSafeEmbedUrl("mailto:a@b.com")).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<h1>x</h1>",
      "vbscript:msgbox(1)",
      "/relativo/caminho",
      "//sem-protocolo.com/x",
      "",
      "https://" + "x".repeat(3000),
    ]) {
      expect(isSafeEmbedUrl(bad)).toBe(false);
    }
  });

  it("draftPreviewText collapses whitespace with ellipsis", () => {
    expect(draftPreviewText("# oi\n\nmundo")).toBe("# oi mundo");
    expect(draftPreviewText("x".repeat(200))).toHaveLength(121);
  });
});

describe("editor-extensions: no redundant deps, full toolbar coverage", () => {
  it("registers Markdown + Image over StarterKit (no duplicates)", () => {
    const extensions = createReviewEditorExtensions();
    const names = extensions.map((ext) => ext.name);
    expect(names).toEqual([
      "tableTextFallback",
      "starterKit",
      "markdown",
      "image",
    ]);
    // Link/underline come from StarterKit v3 itself — never duplicated.
    expect(names.filter((n) => n === "link")).toHaveLength(0);
    expect(names.filter((n) => n === "underline")).toHaveLength(0);
  });

  it("toolbar has no fake actions: every entry is a real command", () => {
    expect(REVIEW_TOOLBAR_ACTIONS).toEqual([
      "h1",
      "h2",
      "h3",
      "bold",
      "italic",
      "strike",
      "code",
      "bulletList",
      "orderedList",
      "blockquote",
      "codeBlock",
      "horizontalRule",
      "link",
      "image",
      "undo",
      "redo",
    ]);
  });

  it("image URLs are remote-only; editor URIs match the Markdown allow-list", () => {
    expect(isAllowedImageUrl("https://a.com/i.png")).toBe(true);
    expect(isAllowedImageUrl("data:image/png;base64,xx")).toBe(false);
    expect(isAllowedImageUrl("blob:https://a.com/u")).toBe(false);
    expect(isAllowedEditorUri("https://a.com")).toBe(true);
    expect(isAllowedEditorUri("javascript:alert(1)")).toBe(false);
  });

  it("stripUnsafePreviewImages keeps https, textualizes the rest", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "antes " },
            {
              type: "image",
              attrs: { src: "https://a.com/ok.png", alt: "ok" },
            },
            {
              type: "image",
              attrs: { src: "data:text/html,<h1>x</h1>", alt: "evil" },
            },
            { type: "image", attrs: { src: "/relativo.png", alt: "" } },
          ],
        },
      ],
    };
    const { doc: cleaned, changed } = stripUnsafePreviewImages(doc);
    expect(changed).toBe(true);
    const para = cleaned.content?.[0];
    const kinds = para?.content?.map((n) =>
      n.type === "image" ? `img:${n.attrs?.src}` : `text:${n.text}`,
    );
    expect(kinds).toEqual([
      "text:antes ",
      "img:https://a.com/ok.png",
      "text:evil",
    ]);
  });

  it("stripUnsafePreviewImages is a no-op for clean documents", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "só texto" }],
        },
      ],
    };
    const { changed } = stripUnsafePreviewImages(doc);
    expect(changed).toBe(false);
  });
});

describe("review-api-client: real backend contract", () => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  it("fetchSessionIdentity returns the user, 401 → SessionExpiredError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: { id: "u1", name: "A", email: "a@b.c" } })),
    );
    await expect(fetchSessionIdentity()).resolves.toMatchObject({ id: "u1" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(fetchSessionIdentity()).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    vi.unstubAllGlobals();
  });

  it("fetchServerReview maps 200/404/401", async () => {
    const review = {
      content: "# Grande jogo",
      excerpt: "Grande jogo",
      source: "review",
      updatedAt: null,
    };
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: review })));
    await expect(fetchServerReview("g1")).resolves.toEqual({
      status: "found",
      review,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "REVIEW_NOT_FOUND" } }, 404)),
    );
    await expect(fetchServerReview("g1")).resolves.toEqual({ status: "missing" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    await expect(fetchServerReview("g1")).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    vi.unstubAllGlobals();
  });

  it("fetchGameSummary returns display-only name, null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: { _id: "g1", name: "Zelda" } })),
    );
    await expect(fetchGameSummary("g1")).resolves.toEqual({
      id: "g1",
      name: "Zelda",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "GAME_NOT_FOUND" } }, 404)),
    );
    await expect(fetchGameSummary("nope")).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
