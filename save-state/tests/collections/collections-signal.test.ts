import { describe, expect, it } from "vitest";
import {
  __resetCollectionsVersion,
  notifyCollectionsChanged,
  subscribeCollections,
  useCollectionsVersion,
} from "@/features/collections/collections-signal";
import { readFileSync } from "fs";
import path from "node:path";

describe("collections invalidation signal (Etapa 5.1)", () => {
  it("notifies subscribers on every change and stops after unsubscribe", () => {
    __resetCollectionsVersion();
    let calls = 0;
    const unsubscribe = subscribeCollections(() => {
      calls += 1;
    });
    notifyCollectionsChanged();
    notifyCollectionsChanged();
    expect(calls).toBe(2);
    expect(typeof useCollectionsVersion).toBe("function");
    unsubscribe();
    notifyCollectionsChanged();
    expect(calls).toBe(2);
    __resetCollectionsVersion();
  });

  it("wires modal, submenu and lists page to the same signal (no reload)", () => {
    const modal = readFileSync(
      path.resolve("features/collections/collection-create-modal.tsx"),
      "utf8",
    );
    expect(modal).toContain("notifyCollectionsChanged");
    expect(modal).not.toContain("window.location.reload");

    const submenu = readFileSync(
      path.resolve("features/navigation/collection-nav-items.tsx"),
      "utf8",
    );
    expect(submenu).toContain("useCollectionsVersion");
    expect(submenu).toContain("notifyCollectionsChanged");
    expect(submenu).not.toContain("window.location.reload");
    expect(submenu).not.toContain("setInterval");
    expect(submenu).not.toContain("CustomEvent");

    const manager = readFileSync(
      path.resolve("features/collections/collections-manager.tsx"),
      "utf8",
    );
    expect(manager).toContain("useCollectionsVersion");
    expect(manager).toContain("notifyCollectionsChanged");
  });

  it("submenu context menu closes on outside interaction and Escape", () => {
    const submenu = readFileSync(
      path.resolve("features/navigation/collection-nav-items.tsx"),
      "utf8",
    );
    expect(submenu).toContain('"Escape"');
    expect(submenu).toContain("mousedown");
    expect(submenu).toContain("touchstart");
    expect(submenu).toContain("stopPropagation");
    expect(submenu).toContain("createPortal");
  });

  it("reuses the existing menu, dialog and API surface (no duplicates)", () => {
    const submenu = readFileSync(
      path.resolve("features/navigation/collection-nav-items.tsx"),
      "utf8",
    );
    expect(submenu).toContain('from "@/features/games/context-menu"');
    expect(submenu).toContain("MenuList");
    expect(submenu).toContain('from "@/features/games/confirm-dialog"');
    expect(submenu).toContain("ConfirmDialog");
    expect(submenu).toContain("/api/game-collections");
    expect(submenu).not.toContain("zustand");
    expect(submenu).not.toContain("react-query");
  });
});
