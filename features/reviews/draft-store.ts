/**
 * Review Editor — IndexedDB draft store (Phase 2).
 *
 * - One database (`save-state-review-drafts`), one store (`drafts`).
 * - Every operation is scoped by `userId`: drafts of another account on the
 *   same browser are invisible (reads return null/false/empty).
 * - Writes use optimistic concurrency: `updateDraft` reads and writes in a
 *   SINGLE readwrite transaction, compares `expectedRevision`, and throws
 *   `DraftConflictError` (carrying the persisted row) instead of silently
 *   overwriting a newer version.
 * - Components must NEVER touch IndexedDB directly — only this API.
 * - Browser-only: every function throws `DraftStorageUnavailableError` when
 *   `indexedDB` is missing (SSR, private mode without IDB, old browsers).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  DraftConflictError,
  DraftNotFoundError,
  type ReviewDraft,
  type ReviewDraftCreateInput,
  type ReviewDraftPatch,
} from "./editor-types";

export { DraftConflictError, DraftNotFoundError };

export class DraftStorageUnavailableError extends Error {
  constructor(reason = "IndexedDB is not available") {
    super(reason);
    this.name = "DraftStorageUnavailableError";
  }
}

const DB_NAME = "save-state-review-drafts";
const DB_VERSION = 1;
const STORE = "drafts";
const USER_INDEX = "by-user-updated";

interface DraftDBSchema extends DBSchema {
  drafts: {
    key: string;
    value: ReviewDraft;
    indexes: { [USER_INDEX]: [string, number] };
  };
}

let dbPromise: Promise<IDBPDatabase<DraftDBSchema>> | null = null;

function isIndexedDBAvailable(): boolean {
  if (typeof indexedDB === "undefined") return false;
  // Node/vitest with fake-indexeddb has no `window` — allow it. In browsers,
  // non-secure contexts may lack a functional IndexedDB.
  if (typeof window === "undefined") return true;
  return window.isSecureContext !== false;
}

function getDB(): Promise<IDBPDatabase<DraftDBSchema>> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(
      new DraftStorageUnavailableError(
        "IndexedDB indisponível neste navegador/contexto",
      ),
    );
  }
  if (!dbPromise) {
    dbPromise = openDB<DraftDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: "draftId" });
        store.createIndex(USER_INDEX, ["userId", "updatedAt"], {
          unique: false,
        });
      },
      blocked() {
        // Another tab holds an older connection open; keep the pending
        // promise — the write retries on the next autosave tick.
        dbPromise = null;
      },
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Test seam: reset the cached connection (does not delete data). */
export function __resetDraftDBConnection(): void {
  dbPromise = null;
}

/** Test seam: remove all rows (keeps the database/version intact). */
export async function __clearDraftsForTests(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
}

function newDraftId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Non-secure contexts (http on some mobile browsers): UUID v4 fallback.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDraftId(value: string): boolean {
  return UUID_RE.test(value);
}

export async function createDraft(
  input: ReviewDraftCreateInput,
): Promise<ReviewDraft> {
  const trimmedUserId = input.userId.trim();
  if (!trimmedUserId) throw new DraftStorageUnavailableError("Missing userId");
  const now = Date.now();
  const draft: ReviewDraft = {
    draftId: newDraftId(),
    userId: trimmedUserId,
    content: input.content,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...(input.userGameId ? { userGameId: input.userGameId } : {}),
    ...(input.gameName ? { gameName: input.gameName } : {}),
  };
  const db = await getDB();
  await db.put(STORE, draft);
  return draft;
}

function ownedOrNull(
  row: ReviewDraft | undefined,
  userId: string,
): ReviewDraft | null {
  if (!row || row.userId !== userId) return null;
  return row;
}

/** Returns null when missing OR owned by another user (no existence leak). */
export async function getDraft(
  draftId: string,
  userId: string,
): Promise<ReviewDraft | null> {
  const db = await getDB();
  return ownedOrNull(await db.get(STORE, draftId), userId);
}

export async function listDrafts(userId: string): Promise<ReviewDraft[]> {
  const db = await getDB();
  // IDBKeyRange bound on [userId, -inf]..[userId, +inf], newest first.
  const rows = await db.getAllFromIndex(
    STORE,
    USER_INDEX,
    IDBKeyRange.bound([userId, 0], [userId, Number.MAX_SAFE_INTEGER]),
  );
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows;
}

export async function findDraftByGame(
  userId: string,
  userGameId: string,
): Promise<ReviewDraft | null> {
  const drafts = await listDrafts(userId);
  return drafts.find((d) => d.userGameId === userGameId) ?? null;
}

/**
 * Atomic compare-and-swap. The read and the write happen in the SAME
 * readwrite transaction: revision matches → write revision+1; mismatch →
 * `DraftConflictError` with the persisted row; missing/foreign →
 * `DraftNotFoundError`. Never overwrites silently.
 */
export async function updateDraft(
  draftId: string,
  userId: string,
  expectedRevision: number,
  patch: ReviewDraftPatch,
): Promise<ReviewDraft> {
  const db = await getDB();
  const tx = db.transaction(STORE, "readwrite");
  try {
    const store = tx.objectStore(STORE);
    const persisted = await store.get(draftId);
    if (!persisted || persisted.userId !== userId) {
      throw new DraftNotFoundError(draftId);
    }
    if (persisted.revision !== expectedRevision) {
      throw new DraftConflictError(persisted);
    }
    const now = Date.now();
    const next: ReviewDraft = {
      ...persisted,
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.userGameId !== undefined
        ? patch.userGameId
          ? { userGameId: patch.userGameId }
          : { userGameId: undefined }
        : {}),
      ...(patch.gameName !== undefined
        ? patch.gameName
          ? { gameName: patch.gameName }
          : { gameName: undefined }
        : {}),
      revision: persisted.revision + 1,
      updatedAt: now,
    };
    await store.put(next);
    await tx.done;
    return next;
  } catch (error) {
    try {
      await tx.done;
    } catch {
      // Transaction already aborted by the throw above — the original
      // DraftConflictError/DraftNotFoundError is what callers handle.
    }
    throw error;
  }
}

/** Deletes only an own draft. Returns false when missing or foreign. */
export async function deleteDraft(
  draftId: string,
  userId: string,
): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const persisted = await store.get(draftId);
  if (!persisted || persisted.userId !== userId) {
    await tx.done;
    return false;
  }
  await store.delete(draftId);
  await tx.done;
  return true;
}
