/**
 * Generic directory primitives shared by the catalog directories.
 * Status filtering helpers and the platform directory were removed in
 * Fase 9B (orphaned after the ATP-backed platform explorer replaced the
 * static directory); only the entry types used by /catalog/empresas remain.
 */

export type DirectoryStatus = "active" | "discontinued";

export interface DirectoryEntry {
  /** Editorial slug for routing (e.g. "nintendo-dev"). */
  id: string;
  /** Display name. */
  name: string;
  /** Real value accepted by the ATP filter (e.g. developer substring). */
  queryValue: string;
  /**
   * Lifecycle status where the directory has one. Entries
   * without a status (companies) omit it and render no badge.
   */
  status?: DirectoryStatus;
  /** Optional frontend image path (public/). Absent → placeholder. */
  image?: string;
}
