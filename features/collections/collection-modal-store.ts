"use client";

import { create } from "zustand";

type CollectionModalMode =
  | { kind: "create" }
  | { kind: "edit"; collectionId: string; initialName: string };

interface CollectionModalState {
  isOpen: boolean;
  mode: CollectionModalMode;
  open: () => void;
  openEdit: (collectionId: string, name: string) => void;
  close: () => void;
}

const CREATE_MODE: CollectionModalMode = { kind: "create" };

export const useCollectionModalStore = create<CollectionModalState>((set) => ({
  isOpen: false,
  mode: CREATE_MODE,
  open: () => set({ isOpen: true, mode: CREATE_MODE }),
  openEdit: (collectionId: string, name: string) =>
    set({ isOpen: true, mode: { kind: "edit", collectionId, initialName: name } }),
  close: () => set({ isOpen: false, mode: CREATE_MODE }),
}));
