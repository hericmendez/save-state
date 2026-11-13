import "server-only";
import { REVIEW_EXCERPT_MAX_LENGTH } from "@/schemas/reviews";

/**
 * Derive plain-text preview from Markdown WITHOUT a Markdown parser
 * dependency and WITHOUT a single "strip everything" regex.
 *
 * Ordered pipeline (each step handles one construct, tested in
 * tests/reviews/excerpt.test.ts):
 *  1. normalize newlines
 *  2. fenced code blocks → keep inner code as visible text
 *  3. inline code → keep inner text
 *  4. images → keep alt text, drop URL
 *  5. links → keep anchor text, drop URL
 *  6. autolinks <https://…> → keep inner URL
 *  7. HTML tags → drop (no raw HTML execution downstream)
 *  8. block markers (headings, quotes, lists, hr, tasks, tables)
 *  9. inline emphasis (bold/italic/strikethrough)
 * 10. whitespace normalization (single spaces, no blank lines)
 *
 * Bare URLs (https://… typed in the open) are visible text and are kept.
 *
 * Known limitations (M7 — intentionally out of scope for a preview):
 * - GFM tables: pipes become spaces and plain `|---|---|` separator rows
 *   are dropped as horizontal rules; cell text stays. Colon-aligned
 *   separators (`|:---|`) may leak `:` fragments — acceptable for a
 *   ~250-char preview, never for persistence (the canonical Markdown in
 *   GameReview.content is always byte-exact).
 * - Footnotes (`[^1]` refs and `[^1]: def` lines): the `[^1]:` definition
 *   line IS dropped (rule 8g), but inline `[^1]` markers are kept verbatim.
 * - Reference-style links keep anchor text; the URL is dropped (intended).
 * - Nested emphasis edge cases (`***x***`, `___x___`) may leave a stray
 *   `*`/`_`; acceptable for a ~250-char preview, never for persistence
 *   (the canonical Markdown in GameReview.content is always byte-exact).
 */
export function markdownToPlainText(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, "\n");

  // 2. Fenced code blocks (```lang … ``` or ~~~ … ~~~): keep inner code.
  text = text.replace(
    /```[^\n]*\n([\s\S]*?)```/g,
    (_m, inner: string) => `\n${inner}\n`,
  );
  text = text.replace(
    /~~~[^\n]*\n([\s\S]*?)~~~/g,
    (_m, inner: string) => `\n${inner}\n`,
  );

  // 3. Inline code `x` → x
  text = text.replace(/`([^`\n]+)`/g, "$1");

  // 4. Images ![alt](url) / ![alt][ref] → alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1");

  // 5. Links [text](url) / [text][ref] → text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");

  // 6. Autolinks <https://example.com> → inner
  text = text.replace(/<(https?:[^>\s]+)>/g, "$1");

  // 7. HTML tags (incl. comments) → drop
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  // 8a. Headings (# …) → text
  text = text.replace(/^#{1,6}\s+/gm, "");
  // 8b. Blockquotes (> …) → text
  text = text.replace(/^(\s*>)+\s?/gm, "");
  // 8c. Task-list boxes (- [ ] / - [x]) → drop box
  text = text.replace(/^(\s*)([-+*]|\d+[.)])\s+\[[ xX]\]\s+/gm, "$1");
  // 8d. Unordered/ordered list markers → drop marker
  text = text.replace(/^(\s*)([-+*]|\d+[.)])\s+/gm, "$1");
  // 8e. Table pipes → spaces FIRST, so GFM separator rows (`|---|---|`)
  // become plain `--- ---` lines that the horizontal-rule drop (8f) catches.
  text = text.replace(/\|/g, " ");
  // 8f. Horizontal rules → drop line
  text = text.replace(/^(\s*)([*_-]\s*){3,}\s*$/gm, "");
  // 8g. Reference definitions [id]: url → drop line
  text = text.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "");

  // 9. Inline emphasis — longest delimiters first.
  text = text.replace(/(\*\*|__)(.+?)\1/g, "$2"); // bold
  text = text.replace(/~~(.+?)~~/g, "$1"); // strikethrough
  text = text.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1$2"); // italic *
  text = text.replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1$2"); // italic _

  // 10. Whitespace: collapse, drop blank lines, join with single spaces.
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join(" ");
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

export function buildReviewExcerpt(
  markdown: string,
  maxLength: number = REVIEW_EXCERPT_MAX_LENGTH,
): string {
  const plain = markdownToPlainText(markdown);
  if (plain.length === 0) return "";
  const chars = Array.from(plain); // surrogate-safe
  if (chars.length <= maxLength) return plain;
  const cut = chars.slice(0, maxLength).join("");
  // Prefer a word boundary in the back half; never cut mid-word when a
  // clean boundary exists, never return a stub.
  const lastSpace = cut.lastIndexOf(" ");
  const base =
    lastSpace > Math.floor(maxLength * 0.4) ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}
