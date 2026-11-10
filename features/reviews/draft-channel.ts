/**
 * Review Editor — cross-tab notifications (Phase 2).
 *
 * Contract:
 * - `postDraftUpdated` is called ONLY after the IndexedDB write is
 *   confirmed. The message carries NO Markdown — receivers re-read the
 *   authoritative row from IndexedDB (and still never clobber in-progress
 *   edits: see the conflict flow in `review-editor-screen.tsx`).
 * - Stale messages (revision <= local revision) are ignored by
 *   `isNewerDraftMessage`.
 * - BroadcastChannel is primary; a `localStorage` ping mirrors it for
 *   browsers without BroadcastChannel (storage events fire only in OTHER
 *   tabs, so there is no self-echo). Payloads are validated on receipt.
 * - `subscribeDraftUpdates` returns an unsubscribe function; callers must
 *   call it on unmount.
 */
import type { ReviewDraftUpdatedMessage } from "./editor-types";

export const DRAFT_CHANNEL_NAME = "save-state:review-drafts";
const DRAFT_STORAGE_PING_KEY = "save-state:review-drafts:ping";

export function isValidDraftUpdatedMessage(
  value: unknown,
): value is ReviewDraftUpdatedMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.type === "draft-updated" &&
    typeof msg.draftId === "string" &&
    msg.draftId.length > 0 &&
    typeof msg.revision === "number" &&
    Number.isInteger(msg.revision) &&
    msg.revision >= 1 &&
    typeof msg.updatedAt === "number" &&
    Number.isFinite(msg.updatedAt)
  );
}

/** True when the notification is newer than the locally known revision. */
export function isNewerDraftMessage(
  message: ReviewDraftUpdatedMessage,
  localRevision: number,
  localUpdatedAt = 0,
): boolean {
  if (message.revision > localRevision) return true;
  if (
    message.revision === localRevision &&
    message.updatedAt > localUpdatedAt
  )
    return true;
  return false;
}

export function isBroadcastAvailable(): boolean {
  return typeof BroadcastChannel !== "undefined";
}

function isStoragePingAvailable(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export interface DraftChannelSubscription {
  post(message: ReviewDraftUpdatedMessage): void;
  unsubscribe(): void;
}

/**
 * Subscribe to confirmed-write notifications for drafts.
 * The handler receives only validated, well-formed messages.
 */
export function subscribeDraftUpdates(
  onMessage: (message: ReviewDraftUpdatedMessage) => void,
): DraftChannelSubscription {
  const handle = (value: unknown) => {
    if (isValidDraftUpdatedMessage(value)) onMessage(value);
  };

  let channel: BroadcastChannel | null = null;
  if (isBroadcastAvailable()) {
    channel = new BroadcastChannel(DRAFT_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => handle(event.data);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== DRAFT_STORAGE_PING_KEY || !event.newValue) return;
    try {
      handle(JSON.parse(event.newValue));
    } catch {
      // Corrupted ping — ignore, IndexedDB stays the source of truth.
    }
  };
  if (!isBroadcastAvailable() && isStoragePingAvailable()) {
    window.addEventListener("storage", onStorage);
  } else if (isStoragePingAvailable()) {
    // Cheap auxiliary signal: helps tabs where a BroadcastChannel
    // listener was attached after the post. Receivers dedupe by revision.
    window.addEventListener("storage", onStorage);
  }

  return {
    post(message: ReviewDraftUpdatedMessage) {
      channel?.postMessage(message);
      // Auxiliary ping (best effort, never throws into the save path).
      try {
        if (isStoragePingAvailable()) {
          window.localStorage.setItem(
            DRAFT_STORAGE_PING_KEY,
            JSON.stringify({ ...message, _ping: Date.now() }),
          );
        }
      } catch {
        // Quota / private mode — the BroadcastChannel already delivered.
      }
    },
    unsubscribe() {
      channel?.close();
      channel = null;
      try {
        window.removeEventListener("storage", onStorage);
      } catch {
        // Already torn down.
      }
    },
  };
}
