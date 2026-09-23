/**
 * ATP domain — client-safe result types.
 *
 * Mirrors the BFF card shape ({...card, owned}). Deliberately NOT the
 * UserGame model: no favorite/status/hoursPlayed/lists — those belong to
 * the backlog domain and must never appear on an ATP result.
 */

export interface AtpSearchCard {
  atpId: string;
  name: string;
  year: number | null;
  platforms: string[];
  genres: string[];
  owned: boolean;
}

export interface AtpSearchPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AtpSearchPage {
  data: AtpSearchCard[];
  pagination: AtpSearchPagination;
}

export interface AtpPreview {
  atpId: string;
  name: string;
  year: number | null;
  platforms: string[];
  developers: string[];
  publishers: string[];
  genres: string[];
  releases: Array<{
    platform: string | null;
    region: string | null;
    year: number | null;
    version: string | null;
    edition: string | null;
  }>;
  externalIdentifiers: Array<{ source: string; id: string }>;
  coverUrl: string | null;
  manualDuplicate: { name: string } | null;
  owned: boolean;
}
