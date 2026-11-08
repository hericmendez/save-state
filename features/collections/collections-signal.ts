"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared collections invalidation signal (Etapa 5.1).
 *
 * Root cause of the stale submenu: CollectionCreateModal called
 * router.refresh() (Server Components only) while CollectionNavItems
 * holds client-side state fetched once on mount. This module is the
 * single cross-component channel: any successful create/rename/delete
 * calls notifyCollectionsChanged(), and every consumer re-reads.
 * React built-in only — no new state library (zustand stays limited to
 * its existing UI stores).
 */

let version = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Testable subscription primitive behind useCollectionsVersion. */
export function subscribeCollections(listener: () => void): () => void {
  return subscribe(listener);
}

function getSnapshot(): number {
  return version;
}

/** Bump the version so every subscriber re-reads collections. */
export function notifyCollectionsChanged(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Re-renders the caller on every collections change. */
export function useCollectionsVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test-only hook: reset the version between cases. */
export function __resetCollectionsVersion(): void {
  version = 0;
}
