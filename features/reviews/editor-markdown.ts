/**
 * Review Editor — Markdown contract (Phase 2).
 *
 * Canonical format: CommonMark with the GFM subset actually implemented by
 * the Tiptap stack (`features/reviews/editor-extensions.ts`):
 *
 * SUPPORTED (toolbar-backed, round-trip tested):
 * - ATX headings H1–H6, paragraphs, hard breaks
 * - bold, italic, strikethrough, inline code
 * - bullet and ordered lists, including nesting
 * - blockquotes, fenced code blocks (with language), horizontal rules
 * - links (http/https/mailto), images by URL (http/https)
 * - undo/redo + standard keyboard shortcuts
 *
 * NOT SUPPORTED by the visual editor (detected by
 * `detectUnsupportedMarkdown`, warned — never silently dropped):
 * - GFM tables, task lists (`- [ ]`), footnotes, raw HTML blocks
 *
 * Normalization (marked-based parser): equivalent syntax may be rewritten
 * (e.g. `***x***` → `**x**`, `#x` spacing, trailing `#` dropped). Semantic
 * content is preserved; byte-for-byte equality is NOT promised.
 *
 * Client-safe and unit-tested. No Markdown parser dependency of its own.
 */
import { REVIEW_CONTENT_MAX_LENGTH } from "@/schemas/reviews";

/** Local autosave debounce. All writes go to IndexedDB only (never MongoDB). */
export const AUTOSAVE_DEBOUNCE_MS = 500;

/** Drafts share the server-side 20k limit so a draft always remains savable. */
export const REVIEW_DRAFT_MAX_LENGTH = REVIEW_CONTENT_MAX_LENGTH;

export function isDraftOverLimit(content: string): boolean {
  return content.length > REVIEW_DRAFT_MAX_LENGTH;
}

export function draftRemainingChars(content: string): number {
  return REVIEW_DRAFT_MAX_LENGTH - content.length;
}

/**
 * Only remote http(s) URLs (and mailto: for links) may be embedded.
 * Rejects `javascript:`, `data:`, `vbscript:`, protocol-relative and
 * relative URLs so pasted Markdown can never become an XSS vector in the
 * read-only preview.
 */
export function isSafeEmbedUrl(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0 || value.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.toLowerCase();
  return (
    protocol === "http:" || protocol === "https:" || protocol === "mailto:"
  );
}

export interface EditorEntryParams {
  draftId?: string;
  userGameId?: string;
}

/**
 * Resolve `/reviews/editor` search params into an entry mode.
 *
 * - both params → `ambiguous` (rejected: the screen shows an explicit
 *   choice instead of guessing).
 * - blank/whitespace-only values are treated as absent.
 * - a draftId that is not a UUID is still accepted as "draft" here and
 *   surfaces as "not found" from the store (explicit, recoverable).
 */
export function resolveEditorEntry(
  params: EditorEntryParams,
): import("./editor-types").ReviewEditorEntry {
  const draftId = (params.draftId ?? "").trim();
  const userGameId = (params.userGameId ?? "").trim();
  if (draftId.length > 0 && userGameId.length > 0) return { kind: "ambiguous" };
  if (draftId.length > 0) return { kind: "draft", draftId };
  if (userGameId.length > 0) return { kind: "game", userGameId };
  return { kind: "empty" };
}

export type UnsupportedMarkdownKind =
  | "table"
  | "task-list"
  | "footnote"
  | "html";

/**
 * Scan raw Markdown for constructs the visual editor cannot represent.
 * Callers warn the user BEFORE switching to visual mode; the original text
 * is always preserved (the visual document only replaces the canonical
 * Markdown after an explicit user edit in visual mode).
 */
export function detectUnsupportedMarkdown(markdown: string): UnsupportedMarkdownKind[] {
  const found = new Set<UnsupportedMarkdownKind>();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

  let inFence = false;
  let prevIsTableRow = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      prevIsTableRow = false;
      continue;
    }
    if (inFence) continue;
    if (/^\s*<(?!3)[a-zA-Z!/?][^>]*>/.test(line)) found.add("html");
    if (/^\s*[-+*]\s+\[[ xX]\]\s+/.test(line)) found.add("task-list");
    if (/^\s*\[\^[^\]]+\]:/.test(line) || /\[\^[^\]]+\]/.test(line))
      found.add("footnote");
    const isTableRow = /^\s*\|?.*\|.*\|\s*$/.test(line) && line.includes("|");
    if (isTableRow && prevIsTableRow) {
      // A `| --- |` delimiter directly under a pipe row = GFM table.
      if (/^[\s|:~-]+$/.test(line) && /-/.test(line)) found.add("table");
    }
    prevIsTableRow = isTableRow;
  }
  // Inline HTML (e.g. `<br/>` inside a paragraph) also bypasses the schema.
  if (
    !found.has("html") &&
    /<(em|strong|span|div|br|img|a|script|iframe|style)\b[^>]*>/i.test(markdown)
  ) {
    found.add("html");
  }
  return [...found];
}

/** Short human-readable excerpt for draft lists (no Markdown parsing). */
export function draftPreviewText(content: string, maxLength = 120): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength).trimEnd()}…`;
}
