import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "node:path";
import { useCollectionModalStore } from "@/features/collections/collection-modal-store";

describe("list modal create/edit modes (correção 5.1)", () => {
  beforeEach(() => {
    useCollectionModalStore.getState().close();
  });

  it("opens in create mode by default", () => {
    useCollectionModalStore.getState().open();
    const state = useCollectionModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toEqual({ kind: "create" });
  });

  it("opens in edit mode with id and current name", () => {
    useCollectionModalStore.getState().openEdit("abc123", "Minhas RPGs");
    const state = useCollectionModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toEqual({
      kind: "edit",
      collectionId: "abc123",
      initialName: "Minhas RPGs",
    });
  });

  it("create mode is preserved after closing an edit session", () => {
    useCollectionModalStore.getState().openEdit("abc123", "X");
    useCollectionModalStore.getState().close();
    const state = useCollectionModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.mode).toEqual({ kind: "create" });
    // Reopening without args is always a fresh create.
    useCollectionModalStore.getState().open();
    expect(useCollectionModalStore.getState().mode).toEqual({ kind: "create" });
  });

  it("reuses one centered modal for both modes (no second modal)", () => {
    const source = readFileSync(
      path.resolve("features/collections/collection-create-modal.tsx"),
      "utf8",
    );
    // Single fixed centered container, shared by both modes.
    expect(source.match(/fixed inset-0/g)?.length).toBe(1);
    expect(source).toContain("Renomear lista");
    expect(source).toContain("Salvar alterações");
    expect(source).toContain("Nova Coleção");
    // Edit prefills from the store and PATCHes the existing list.
    expect(source).toContain("mode.initialName");
    expect(source).toContain("`/api/game-collections/${mode.collectionId}`");
    // Create path untouched (POST, same validation/error handling).
    expect(source).toContain('"/api/game-collections"');
    expect(source).toContain('method: "POST"');
    expect(source).toContain("notifyCollectionsChanged");
  });

  it("ConfirmDialog renders through a viewport portal (not trapped in containers)", () => {
    const source = readFileSync(
      path.resolve("features/games/confirm-dialog.tsx"),
      "utf8",
    );
    expect(source).toContain("createPortal");
    expect(source).toContain("document.body");
    expect(source).toContain("fixed inset-0");
    expect(source).toContain('role="alertdialog"');
  });

  it("submenu rename opens the shared modal and delete opens the dialog (menu closes first)", () => {
    const source = readFileSync(
      path.resolve("features/navigation/collection-nav-items.tsx"),
      "utf8",
    );
    // No inline sidebar form anymore.
    expect(source).not.toContain("renamingId");
    expect(source).not.toContain("RPGUInput");
    // Rename: menu closes, shared edit modal opens prefilled.
    expect(source).toContain("openEdit(collection._id, collection.name)");
    // Delete: menu closes, shared ConfirmDialog confirms.
    expect(source).toContain("setDeleteTarget(menuFor)");
    expect(source).toContain("ConfirmDialog");
    // Opening the context menu never navigates.
    expect(source).toContain("stopPropagation");
    expect(source).toContain("preventDefault");
  });
});
