import type { DirectoryEntry } from "@/features/catalog/directory/types";

export type CompanyRole = "developer" | "publisher";

export type CompanyRoleFilter = "all" | CompanyRole;

export interface CompanyEntry extends DirectoryEntry {
  role: CompanyRole;
}

export const COMPANY_ROLE_FILTERS: CompanyRoleFilter[] = [
  "all",
  "developer",
  "publisher",
];

/**
 * Editorial company directory. Each entry declares exactly one ATP
 * dimension (developer XOR publisher): a company relevant in both appears
 * twice (e.g. nintendo-dev + nintendo-pub) rather than hiding the
 * semantic difference. queryValue is the real substring accepted by ATP's
 * findMany (case-insensitive). No `image` entries ship yet: cards render
 * the placeholder until art is provided per company.
 */
export const COMPANY_DIRECTORY: CompanyEntry[] = [
  {
    id: "nintendo-dev",
    name: "Nintendo",
    role: "developer",
    queryValue: "Nintendo",
  },
  {
    id: "nintendo-pub",
    name: "Nintendo",
    role: "publisher",
    queryValue: "Nintendo",
  },
  {
    id: "sony-dev",
    name: "Sony Computer Entertainment",
    role: "developer",
    queryValue: "Sony Computer Entertainment",
  },
  {
    id: "sony-pub",
    name: "Sony Computer Entertainment",
    role: "publisher",
    queryValue: "Sony Computer Entertainment",
  },
  {
    id: "bandai-namco-dev",
    name: "Bandai Namco",
    role: "developer",
    queryValue: "Bandai Namco",
  },
  {
    id: "hal-dev",
    name: "HAL Laboratory",
    role: "developer",
    queryValue: "HAL Laboratory",
  },
  {
    id: "sora-dev",
    name: "Sora Ltd.",
    role: "developer",
    queryValue: "Sora",
  },
];

export function filterCompaniesByRole(
  entries: CompanyEntry[],
  role: CompanyRoleFilter,
): CompanyEntry[] {
  if (role === "all") return entries;
  return entries.filter((entry) => entry.role === role);
}

export function findCompanyEntry(
  entries: CompanyEntry[],
  id: string,
): CompanyEntry | null {
  return entries.find((entry) => entry.id === id) ?? null;
}
