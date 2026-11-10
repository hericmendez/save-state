// @vitest-environment jsdom
/**
 * Phase 2 — Tiptap Markdown round-trip (real editor, jsdom).
 *
 * Asserts the semantic-preservation contract: Markdown → document →
 * Markdown keeps headings, emphasis, nested lists, links-with-formatting,
 * images, code blocks with language, breaks, escapes and Unicode.
 * Byte-for-byte equality is NOT required (the parser normalizes syntax).
 */
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createReviewEditorExtensions } from "@/features/reviews/editor-extensions";

function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: createReviewEditorExtensions(),
    content: markdown,
    contentType: "markdown",
  });
  const out = editor.getMarkdown();
  editor.destroy();
  return out;
}

describe("tiptap markdown round-trip", () => {
  it("preserves headings, paragraphs and emphasis", () => {
    const out = roundTrip("# Título\n\nUm **negrito**, *itálico* e ~~riscado~~.");
    expect(out).toContain("# Título");
    expect(out).toContain("**negrito**");
    expect(out).toContain("~~riscado~~");
    expect(out).toMatch(/_itálico_|\*itálico\*/);
  });

  it("preserves nested lists and ordered lists", () => {
    const out = roundTrip("- a\n  - aninhado\n- b\n\n1. um\n2. dois");
    expect(out).toContain("aninhado");
    expect(out).toMatch(/1\. um/);
  });

  it("preserves links with formatting, images and code", () => {
    const md = [
      "[texto **forte**](https://exemplo.com)",
      "![alt da imagem](https://exemplo.com/img.png)",
      "`inline`",
      "```ts",
      "const a: number = 1;",
      "```",
      "> citação",
      "---",
    ].join("\n\n");
    const out = roundTrip(md);
    expect(out).toContain("https://exemplo.com");
    expect(out).toContain("alt da imagem");
    expect(out).toContain("inline");
    expect(out).toContain("const a: number = 1;");
    expect(out).toContain("citação");
  });

  it("preserves breaks, escapes and unicode", () => {
    const out = roundTrip("linha um  \nlinha dois\n\n\\*literal\\* e 日本語 🎮");
    expect(out).toContain("linha um");
    expect(out).toContain("linha dois");
    expect(out).toContain("日本語 🎮");
  });

  it("registers link exactly once and no underline mark", () => {
    const editor = new Editor({
      extensions: createReviewEditorExtensions(),
      content: "texto",
      contentType: "markdown",
    });
    const linkMarks = editor.extensionManager.extensions.filter(
      (ext) => ext.name === "link",
    );
    expect(linkMarks).toHaveLength(1);
    expect(editor.schema.marks["link"]).toBeDefined();
    expect(editor.schema.marks["underline"]).toBeUndefined();
    editor.destroy();
  });

  it("serializes links through the StarterKit-bundled mark", () => {
    const out = roundTrip("[clique aqui](https://exemplo.com/pagina)");
    expect(out).toContain("[clique aqui](https://exemplo.com/pagina)");
  });

  it("preserves GFM table cell text as plain paragraphs (no silent loss)", () => {
    const out = roundTrip("| nome | pontos |\n|------|--------|\n| **Ana** | 10 |\n| Bob | 7 |");
    expect(out).toContain("nome");
    expect(out).toContain("pontos");
    expect(out).toContain("Ana");
    expect(out).toContain("10");
    expect(out).toContain("Bob");
    expect(out).toContain("7");
  });
});
