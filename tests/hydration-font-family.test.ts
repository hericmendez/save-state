import { describe, expect, it } from "vitest";
import { normalizeFontFamilyList } from "./hydration-font-family";

const expected = "Roboto, Roboto Fallback, system-ui, sans-serif";

describe("normalizeFontFamilyList", () => {
  it("treats quoted CSSOM and unquoted computed family names as equivalent", () => {
    expect(
      normalizeFontFamilyList(
        '"Roboto","Roboto Fallback", system-ui, sans-serif',
      ),
    ).toEqual(normalizeFontFamilyList(expected));
  });

  it("keeps missing and different families significant", () => {
    expect(normalizeFontFamilyList("Roboto, system-ui, sans-serif")).not.toEqual(
      normalizeFontFamilyList(expected),
    );
    expect(
      normalizeFontFamilyList(
        "Roboto, Different Fallback, system-ui, sans-serif",
      ),
    ).not.toEqual(normalizeFontFamilyList(expected));
  });

  it("keeps family order and the final fallback significant", () => {
    expect(
      normalizeFontFamilyList(
        "Roboto Fallback, Roboto, system-ui, sans-serif",
      ),
    ).not.toEqual(normalizeFontFamilyList(expected));
    expect(
      normalizeFontFamilyList("Roboto, Roboto Fallback, system-ui, serif"),
    ).not.toEqual(normalizeFontFamilyList(expected));
  });

  it("does not split commas inside a quoted family name", () => {
    expect(normalizeFontFamilyList('"Roboto, Condensed", sans-serif')).toEqual([
      "Roboto, Condensed",
      "sans-serif",
    ]);
  });
});
