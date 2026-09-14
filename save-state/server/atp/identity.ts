/**
 * ATP identity stability policy (ADR-024, decision F).
 *
 * The ATP Game.domainId is opaque to Save State — except for two fallback
 * namespaces that ATP itself generates and that must never become durable
 * cross-system references in GlobalGame.atpDomainId:
 *
 * - `atp-unknown-*`: emitted by the normal discovery/sync persistence path
 *   when a group passes the eligibility gate but carries no external
 *   identifiers
 *   (atp-engine catalog-service.ts / catalog-sync-service.ts:
 *   `atp-${... ?? 'unknown'}-${... ?? Date.now()}`). Timestamp-suffixed,
 *   therefore neither stable nor deduplicating.
 * - `admin-*`: emitted by manual admin creates
 *   (atp-engine game-admin-service.ts:
 *   `admin-${Date.now()}-${random}`). Unique but opaque and operational,
 *   not canonical catalog identity.
 *
 * Both are persisted by ATP and reachable via its public game endpoints,
 * so the quarantine must live on the Save State side, at import time.
 *
 * `discovery-*` IDs need no rule: they are transient helpers overwritten
 * before ATP persistence, so lookups fail naturally with ATP_GAME_NOT_FOUND.
 */

import "server-only";
import { ApiError } from "@/lib/api-error";

/** ATP's own non-durable identity namespaces (lowercase, as generated). */
const UNSTABLE_ATP_ID_PREFIXES = ["atp-unknown-", "admin-"] as const;

export function isStableAtpIdentity(atpId: string): boolean {
  const normalized = atpId.toLowerCase();
  return !UNSTABLE_ATP_ID_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

/**
 * Reject non-durable ATP identities before any database or ATP access.
 * Throws UNSTABLE_ATP_IDENTITY (422): the id is syntactically valid but
 * unacceptable as a durable GlobalGame.atpDomainId reference.
 */
export function assertStableAtpIdentity(atpId: string): void {
  if (!isStableAtpIdentity(atpId)) {
    throw new ApiError(
      "UNSTABLE_ATP_IDENTITY",
      "ATP identity is not a stable canonical reference and cannot be imported",
      422,
    );
  }
}
