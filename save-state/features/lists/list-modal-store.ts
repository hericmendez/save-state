"use client";

import { create } from "zustand";

interface ListModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useListModalStore = create<ListModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
