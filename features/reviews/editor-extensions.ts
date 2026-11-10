/**
 * Review Editor — Tiptap extension set (Phase 2).
 *
 * Canonical stack (no redundant extensions — each capability below is
 * asserted in `tests/reviews/review-editor-stack.test.ts`):
 *
 * - `StarterKit`: doc, paragraph, text, heading H1–H6, bold, italic,
 *   strike, bullet/ordered lists + listItem, blockquote, code, codeBlock,
 *   horizontalRule, hardBreak, link (configured here), history (undo/redo),
 *   dropcursor/gapcursor. Underline is DISABLED (no toolbar action).
 *   Image is NOT in StarterKit, so it is added explicitly.
 * - `Markdown` (@tiptap/markdown): `editor.getMarkdown()`,
 *   `setContent(md, { contentType: "markdown" })`, `contentType: "markdown"`.
 * - `Image`: images by URL (http/https only; NO upload in this phase).
 *
 * Client-safe module (no JSX). The React binding (`useEditor`) lives in
 * `tiptap-review-editor.tsx`, loaded lazily via `next/dynamic ssr:false`
 * so common pages never pay for this bundle.
 */
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Extension } from "@tiptap/core";
import type {
  AnyExtension,
  JSONContent,
  MarkdownParseHelpers,
  MarkdownToken,
} from "@tiptap/core";
import { isSafeEmbedUrl } from "./editor-markdown";

export const REVIEW_EDITOR_ALLOWED_PROTOCOLS = ["http", "https", "mailto"];

export function isAllowedEditorUri(url: string): boolean {
  return isSafeEmbedUrl(url);
}

/**
 * Image URLs are remote-only in Phase 2 (no upload). `data:`/`blob:` are
 * rejected so a pasted data-URI cannot bloat a draft or the preview.
 */
export function isAllowedImageUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.toLowerCase();
  return protocol === "http:" || protocol === "https:";
}

export function createReviewEditorExtensions(): AnyExtension[] {
  return [
    TableTextFallback,
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // History (undo/redo) stays enabled — required toolbar actions.
      // NOTE: StarterKit v3 already bundles Link and Underline. Link is
      // configured here (not as a separate extension) to avoid the
      // "duplicate extension names" conflict; Underline is disabled
      // because the toolbar has no underline action.
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isAllowedEditorUri(url),
      },
      underline: false,
    }),
    Markdown.configure({
      indentation: { style: "space", size: 2 },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
    }),
  ];
}

/** Toolbar model — every button maps to a real command (no fake actions). */
export type ReviewToolbarAction =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule"
  | "link"
  | "image"
  | "undo"
  | "redo";

export const REVIEW_TOOLBAR_ACTIONS: ReviewToolbarAction[] = [
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
];

/**
 * GFM-table fallback (Phase 2 has no table UI): the default Markdown fallback
 * returns `null` for `table` tokens (marked exposes header/rows, not
 * `tokens`), silently discarding every cell. This handler preserves header
 * and cell text — including inline formatting — as plain paragraphs joined
 * with " | ", so switching to visual mode normalizes tables WITHOUT losing
 * content. The pre-switch warning (`detectUnsupportedMarkdown`) stays: the
 * table *structure* is still not representable.
 */
export const TableTextFallback = Extension.create({
  name: "tableTextFallback",
  markdownTokenName: "table",
  parseMarkdown(
    token: MarkdownToken,
    helpers: MarkdownParseHelpers,
  ): JSONContent[] {
    const rows: MarkdownToken[][] = [];
    const header = token["header"];
    if (Array.isArray(header) && header.length > 0) {
      rows.push(header as MarkdownToken[]);
    }
    const body = token["rows"];
    if (Array.isArray(body)) {
      for (const row of body) {
        if (Array.isArray(row)) rows.push(row as MarkdownToken[]);
      }
    }
    if (rows.length === 0) return [];
    return rows.map((cells) => {
      const inline: JSONContent[] = [];
      cells.forEach((cell, index) => {
        if (index > 0) inline.push({ type: "text", text: " | " });
        const cellTokens = Array.isArray(cell.tokens) ? cell.tokens : [];
        if (cellTokens.length > 0) {
          inline.push(...helpers.parseInline(cellTokens));
        } else if (typeof cell.text === "string" && cell.text.length > 0) {
          inline.push({ type: "text", text: cell.text });
        }
      });
      return { type: "paragraph", content: inline };
    });
  },
});

/**
 * Preview-only sanitizer: drop images whose `src` is not an http(s) URL
 * (`data:`, `blob:`, relative paths, inline-HTML `<img>` without absolute
 * URL). Dropped images are replaced by their alt text so no information
 * silently vanishes; the CANONICAL Markdown is untouched — only the
 * throwaway read-only preview document is filtered.
 */
export function stripUnsafePreviewImages(doc: JSONContent): {
  doc: JSONContent;
  changed: boolean;
} {
  let changed = false;
  const cleanNode = (
    node: JSONContent,
  ): JSONContent | JSONContent[] | null => {
    if (node.type === "image") {
      const src =
        typeof node.attrs?.src === "string" ? node.attrs.src : "";
      if (isAllowedImageUrl(src)) return node;
      changed = true;
      const alt =
        typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return alt ? { type: "text", text: alt } : null;
    }
    if (Array.isArray(node.content)) {
      const out: JSONContent[] = [];
      for (const child of node.content) {
        const cleaned = cleanNode(child);
        if (Array.isArray(cleaned)) out.push(...cleaned);
        else if (cleaned) out.push(cleaned);
      }
      const sameLength = out.length === node.content.length;
      const sameRefs =
        sameLength && out.every((n, i) => n === node.content?.[i]);
      if (sameRefs) return node;
      changed = true;
      return { ...node, content: out };
    }
    return node;
  };
  const root = cleanNode(doc);
  const finalDoc = Array.isArray(root) ? { ...doc, content: root } : (root ?? doc);
  return { doc: finalDoc, changed };
}
