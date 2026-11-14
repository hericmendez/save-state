import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve("app/globals.css"), "utf8").replace(/\r\n/g, "\n");

function blockStartingAt(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `selector not found: ${selector}`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("RPGUI text-input styling", () => {
  it("removes the black outline shadow from text inputs and textareas", () => {
    const inputBlock = blockStartingAt(".rpgui-input,\ntextarea.rpgui-input");
    expect(inputBlock).not.toMatch(/text-shadow\s*:/);
    // The surface itself is unchanged.
    expect(inputBlock).toContain("background: #4e4a4e");
    expect(inputBlock).toContain("color: white");
  });

  it("keeps the highlight shadow on headings and RPGUI buttons", () => {
    const highlight = blockStartingAt(
      ".font-display,\n.press-start-2p-regular,\n.rpgui-button",
    );
    expect(highlight).toMatch(/text-shadow\s*:/);
  });

  it("does not touch checkbox, radio or range controls", () => {
    const inputBlock = blockStartingAt(".rpgui-input,\ntextarea.rpgui-input");
    for (const selector of ["checkbox", "radio", "range"]) {
      expect(inputBlock).not.toContain(selector);
    }
  });
});
