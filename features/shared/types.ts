/**
 * Shared frontend domain types. These mirror the API wire shapes
 * ({_id} is the UserGame id; `game` is the populated GlobalGame).
 */

export interface GlobalGameSummary {
  _id?: string;
  name: string;
  // Catalog origin. Non-manual snapshots are metadata-immutable; the
  // edit form uses this to lock metadata fields (personal fields stay
  // editable).
  source?: "manual" | "atp" | "igdb";
  cover?: string | null;
  genres?: string[];
  platforms?: string[];
  developers?: string[];
  publishers?: string[];
  releaseDate?: string | null;
  summary?: string | null;
}

export interface Game {
  _id: string;
  userId?: string;
  status?: string;
  hoursPlayed?: number | null;
  timesFinished?: number | null;
  rating?: number | null;
  review?: string | null;
  collectionIds?: string[];
  favorite?: boolean;
  finished?: boolean;
  fullyCompleted?: boolean;
  achievements?: boolean;
  achievementProgress?: number | null;
  achievementsCompleted?: boolean;
  game: GlobalGameSummary | null;
}

export interface GameCollection {
  _id: string;
  name: string;
  gameCount?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}
