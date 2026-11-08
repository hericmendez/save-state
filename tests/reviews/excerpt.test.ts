import { describe, expect, it } from "vitest";
import {
  buildReviewExcerpt,
  markdownToPlainText,
} from "@/server/reviews/excerpt";
import { REVIEW_EXCERPT_MAX_LENGTH } from "@/schemas/reviews";

describe("markdownToPlainText", () => {
  it("strips headings, bold, italic, strikethrough", () => {
    expect(
      markdownToPlainText("# Title\n**bold** and *italic* and ~~strike~~"),
    ).toBe("Title bold and italic and strike");
  });

  it("keeps link text and image alt, drops URLs", () => {
    expect(
      markdownToPlainText(
        "See [docs](https://example.com/x) and ![cover](https://img/u.png)",
      ),
    ).toBe("See docs and cover");
  });

  it("keeps list and quote text without markers", () => {
    expect(
      markdownToPlainText("> quoted\n\n- one\n- two\n\n1. first\n2. second"),
    ).toBe("quoted one two first second");
  });

  it("keeps fenced and inline code content without backticks", () => {
    expect(
      markdownToPlainText("```ts\nconst a = 1;\n```\nUse `x` here"),
    ).toBe("const a = 1; Use x here");
  });

  it("normalizes spacing, blank lines and unicode", () => {
    expect(
      markdownToPlainText("  Olá   mundo  \n\n\n🎮  jogão\t\ttop  "),
    ).toBe("Olá mundo 🎮 jogão top");
  });

  it("returns empty for empty/whitespace/markup-only input", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText("   \n\n  ")).toBe("");
    expect(markdownToPlainText("# \n---\n")).toBe("");
  });

  it("flattens GFM tables and drops the separator row", () => {
    expect(
      markdownToPlainText("| a | b |\n|---|---|\n| 1 | 2 |"),
    ).toBe("a b 1 2");
  });
});

describe("buildReviewExcerpt", () => {
  it("returns short text untouched", () => {
    expect(buildReviewExcerpt("Short review.")).toBe("Short review.");
  });

  it("truncates ~250 chars at a word boundary with ellipsis", () => {
    const long = `${"word ".repeat(80)}end`;
    const excerpt = buildReviewExcerpt(long);
    expect(excerpt.length).toBeLessThanOrEqual(
      REVIEW_EXCERPT_MAX_LENGTH + 1,
    );
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toMatch(/ \S…$/);
  });

  it("never emits raw markdown delimiters", () => {
    const excerpt = buildReviewExcerpt(
      "# T\n\n**B** [l](https://e.com) ![i](https://e.com/i.png)\n- a\n> q\n`c`",
    );
    expect(excerpt).not.toContain("#");
    expect(excerpt).not.toContain("**");
    expect(excerpt).not.toContain("](");
  });
});
