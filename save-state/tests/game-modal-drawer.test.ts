/**
 * GameModal drawer contract (source-level, same convention as
 * loading-ux.test.ts — the repo has no DOM test infrastructure).
 *
 * Guards the RTL drawer behavior: right-anchored panel, ~60vw on desktop,
 * full width on mobile, overlay close, ESC, and background scroll lock.
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const PATH = "features/games/game-modal.tsx";
const source = readFileSync(PATH, "utf8");

describe("game modal drawer", () => {
  it("anchors the panel to the right edge", () => {
    expect(source).toContain("items-stretch justify-end");
    // The old centered overlay is gone (inner content may still center
    // its own children, e.g. the cover placeholder).
    expect(source).not.toContain("items-center justify-center bg-black/70");
  });

  it("slides horizontally (RTL) instead of rising vertically", () => {
    expect(source).toContain('initial={{ x: "100%" }}');
    expect(source).toContain("exit={{ x: \"100%\" }}");
    expect(source).not.toContain("initial={{ y: 40");
  });

  it("sizes full width on mobile and ~60vw on desktop", () => {
    expect(source).toContain("w-full");
    expect(source).toContain("md:w-[60vw]");
    expect(source).not.toContain("max-w-2xl");
  });

  it("scrolls inside the drawer", () => {
    expect(source).toContain("h-full");
    expect(source).toContain("overflow-y-auto");
  });

  it("preserves overlay close, ESC, scroll lock and dialog semantics", () => {
    expect(source).toContain("onClick={onClose}");
    expect(source).toContain("event.stopPropagation()");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it("keeps notes autofocus wiring", () => {
    expect(source).toContain("autoFocusNotes");
    expect(source).toContain("autoFocusNew={autoFocusNotes}");
  });

  it("composes the hero with cover background and front cover", () => {
    expect(source).toContain("object-cover");
    expect(source).toContain("bg-gradient-to-t from-black");
    expect(source).toContain("aria-label=\"Fechar\"");
  });

  it("splits personal data into journey and review sections", () => {
    expect(source).toContain('aria-label="Sua jornada"');
    expect(source).toContain('aria-label="Sua avaliação"');
    expect(source).toContain("GameNotesSection");
  });
});
