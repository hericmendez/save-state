/**
 * GameModal drawer contract (source-level, same convention as
 * loading-ux.test.ts — the repo has no DOM test infrastructure).
 *
 * Guards the RTL drawer behavior: right-anchored panel, ~60vw on desktop,
 * full width on mobile, overlay close, ESC, and background scroll lock.
 *
 * Phase 4: the drawer was refactored — chrome lives in
 * game-drawer-shell.tsx, composition in game-modal.tsx, and hero/journey/
 * review/notes in user-game-drawer-content.tsx. Assertions now target the
 * real files instead of the pre-refactor monolith.
 */

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const SHELL = "features/games/game-drawer-shell.tsx";
const MODAL = "features/games/game-modal.tsx";
const CONTENT = "features/games/user-game-drawer-content.tsx";
const shell = readFileSync(SHELL, "utf8");
const modal = readFileSync(MODAL, "utf8");
const content = readFileSync(CONTENT, "utf8");

describe("game modal drawer", () => {
  it("anchors the panel to the right edge", () => {
    expect(shell).toContain("items-stretch justify-end");
    // The old centered overlay is gone (inner content may still center
    // its own children, e.g. the cover placeholder).
    expect(shell).not.toContain("items-center justify-center bg-black/70");
  });

  it("slides horizontally (RTL) instead of rising vertically", () => {
    expect(shell).toContain('initial={{ x: "100%" }}');
    expect(shell).toContain('exit={{ x: "100%" }}');
    expect(shell).not.toContain("initial={{ y: 40");
  });

  it("sizes full width on mobile and ~60vw on desktop", () => {
    expect(shell).toContain("w-full");
    expect(shell).toContain("md:w-[60vw]");
    expect(shell).not.toContain("max-w-2xl");
  });

  it("scrolls inside the drawer", () => {
    expect(shell).toContain("h-full");
    expect(shell).toContain("overflow-y-auto");
  });

  it("preserves overlay close, ESC, scroll lock and dialog semantics", () => {
    expect(shell).toContain("onClick={onClose}");
    expect(shell).toContain("event.stopPropagation()");
    expect(shell).toContain('event.key === "Escape"');
    expect(shell).toContain('document.body.style.overflow = "hidden"');
    expect(shell).toContain('role="dialog"');
    expect(shell).toContain('aria-modal="true"');
  });

  it("keeps notes autofocus wiring", () => {
    expect(modal).toContain("autoFocusNotes");
    expect(content).toContain("autoFocusNew={autoFocusNotes}");
  });

  it("composes the hero with cover background and front cover", () => {
    expect(content).toContain("object-cover");
    expect(content).toContain("bg-gradient-to-t from-black");
    expect(shell).toContain('aria-label="Fechar"');
  });

  it("splits personal data into journey and review sections", () => {
    expect(content).toContain('aria-label="Sua jornada"');
    expect(content).toContain('aria-label="Sua avaliação"');
    expect(content).toContain("GameNotesSection");
  });
});
