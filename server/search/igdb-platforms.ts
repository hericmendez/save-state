/**
 * Save State-owned IGDB platform catalog (Etapa 3).
 *
 * Platforms, families and generations belong to Save State — not to the
 * search provider. This module is Save State's own catalog: every entry
 * maps a Save State platform name onto its verified IGDB platform id.
 * IDs come from the ATP Engine curation allowlist (verified), rewritten
 * here as data (no code imports from atp-engine, per AGENTS.md §2.1).
 *
 * - `name`: display name (IGDB official).
 * - `aliases`: other strings the UI may send (curated/ATP variants,
 *   common abbreviations). Matching is exact on normalized
 *   (trim + lowercase) values — never fuzzy, never invented.
 * - `company`/`releaseYear`: curated display metadata ("" / null when
 *   unknown — never invented). `releaseYear` is the earliest launch year.
 * - `status`: "active" only for platforms verifiably still receiving new
 *   releases; otherwise "discontinued".
 * - `gameCount`: curation snapshot from the allowlist (stale by nature —
 *   the platform *detail* lookup refreshes it live via /games/count).
 * - `family`: Save State taxonomy (Nintendo, Sony, Microsoft, Sega,
 *   Atari, SNK, PC, Mobile, Arcade, Other).
 */

export interface IgdbCatalogPlatform {
  igdbId: number;
  name: string;
  aliases: string[];
  company: string;
  family: string;
  releaseYear: number | null;
  status: "active" | "discontinued";
  gameCount: number;
}

export const IGDB_PLATFORM_CATALOG: readonly IgdbCatalogPlatform[] = [
  { igdbId: 3, name: "Linux", aliases: ["linux"], company: "", family: "PC", releaseYear: null, status: "active", gameCount: 12738 },
  { igdbId: 4, name: "Nintendo 64", aliases: ["nintendo 64", "n64"], company: "Nintendo", family: "Nintendo", releaseYear: 1996, status: "discontinued", gameCount: 393 },
  { igdbId: 5, name: "Wii", aliases: ["wii"], company: "Nintendo", family: "Nintendo", releaseYear: 2006, status: "discontinued", gameCount: 2635 },
  { igdbId: 6, name: "PC (Microsoft Windows)", aliases: ["windows", "pc"], company: "Microsoft", family: "PC", releaseYear: null, status: "active", gameCount: 84808 },
  { igdbId: 7, name: "PlayStation", aliases: ["playstation", "ps", "ps1", "psx"], company: "Sony", family: "Sony", releaseYear: 1994, status: "discontinued", gameCount: 3253 },
  { igdbId: 8, name: "PlayStation 2", aliases: ["playstation 2", "ps2"], company: "Sony", family: "Sony", releaseYear: 2000, status: "discontinued", gameCount: 3535 },
  { igdbId: 9, name: "PlayStation 3", aliases: ["playstation 3", "ps3"], company: "Sony", family: "Sony", releaseYear: 2006, status: "discontinued", gameCount: 5174 },
  { igdbId: 11, name: "Xbox", aliases: ["xbox"], company: "Microsoft", family: "Microsoft", releaseYear: 2001, status: "discontinued", gameCount: 1068 },
  { igdbId: 12, name: "Xbox 360", aliases: ["xbox 360"], company: "Microsoft", family: "Microsoft", releaseYear: 2005, status: "discontinued", gameCount: 5008 },
  { igdbId: 13, name: "DOS", aliases: ["dos", "ms-dos", "pc dos"], company: "Microsoft", family: "PC", releaseYear: 1981, status: "discontinued", gameCount: 4238 },
  { igdbId: 14, name: "Mac", aliases: ["mac", "macintosh"], company: "Apple", family: "PC", releaseYear: 1984, status: "active", gameCount: 23586 },
  { igdbId: 15, name: "Commodore C64/128/MAX", aliases: ["commodore 64", "commodore c64", "c64"], company: "Commodore", family: "PC", releaseYear: 1982, status: "discontinued", gameCount: 5755 },
  { igdbId: 18, name: "Nintendo Entertainment System", aliases: ["nes", "nintendo entertainment system"], company: "Nintendo", family: "Nintendo", releaseYear: 1983, status: "discontinued", gameCount: 1658 },
  { igdbId: 19, name: "Super Nintendo Entertainment System", aliases: ["snes", "super nintendo entertainment system", "super nintendo"], company: "Nintendo", family: "Nintendo", releaseYear: 1990, status: "discontinued", gameCount: 1335 },
  { igdbId: 20, name: "Nintendo DS", aliases: ["nintendo ds", "nintendo ds lite", "nds"], company: "Nintendo", family: "Nintendo", releaseYear: 2004, status: "discontinued", gameCount: 2406 },
  { igdbId: 21, name: "Nintendo GameCube", aliases: ["gamecube", "nintendo gamecube"], company: "Nintendo", family: "Nintendo", releaseYear: 2001, status: "discontinued", gameCount: 635 },
  { igdbId: 22, name: "Game Boy Color", aliases: ["game boy color", "gbc"], company: "Nintendo", family: "Nintendo", releaseYear: 1998, status: "discontinued", gameCount: 766 },
  { igdbId: 23, name: "Dreamcast", aliases: ["dreamcast", "sega dreamcast"], company: "Sega", family: "Sega", releaseYear: 1998, status: "discontinued", gameCount: 612 },
  { igdbId: 24, name: "Game Boy Advance", aliases: ["game boy advance", "gba"], company: "Nintendo", family: "Nintendo", releaseYear: 2001, status: "discontinued", gameCount: 1285 },
  { igdbId: 26, name: "ZX Spectrum", aliases: ["zx spectrum", "spectrum"], company: "Sinclair", family: "PC", releaseYear: 1982, status: "discontinued", gameCount: 3683 },
  { igdbId: 27, name: "MSX", aliases: ["msx"], company: "", family: "PC", releaseYear: 1983, status: "discontinued", gameCount: 1501 },
  { igdbId: 29, name: "Sega Mega Drive/Genesis", aliases: ["genesis", "sega genesis", "sega mega drive", "sega mega drive/genesis", "mega drive"], company: "Sega", family: "Sega", releaseYear: 1988, status: "discontinued", gameCount: 1075 },
  { igdbId: 30, name: "Sega 32X", aliases: ["sega 32x"], company: "Sega", family: "Sega", releaseYear: 1994, status: "discontinued", gameCount: 41 },
  { igdbId: 32, name: "Sega Saturn", aliases: ["sega saturn", "saturn"], company: "Sega", family: "Sega", releaseYear: 1994, status: "discontinued", gameCount: 1161 },
  { igdbId: 33, name: "Game Boy", aliases: ["game boy", "gb"], company: "Nintendo", family: "Nintendo", releaseYear: 1989, status: "discontinued", gameCount: 890 },
  { igdbId: 34, name: "Android", aliases: ["android"], company: "Google", family: "Mobile", releaseYear: 2008, status: "active", gameCount: 14076 },
  { igdbId: 35, name: "Sega Game Gear", aliases: ["game gear", "sega game gear"], company: "Sega", family: "Sega", releaseYear: 1990, status: "discontinued", gameCount: 369 },
  { igdbId: 37, name: "Nintendo 3DS", aliases: ["nintendo 3ds", "3ds"], company: "Nintendo", family: "Nintendo", releaseYear: 2011, status: "discontinued", gameCount: 1696 },
  { igdbId: 38, name: "PlayStation Portable", aliases: ["psp", "playstation portable"], company: "Sony", family: "Sony", releaseYear: 2004, status: "discontinued", gameCount: 2327 },
  { igdbId: 41, name: "Wii U", aliases: ["wii u"], company: "Nintendo", family: "Nintendo", releaseYear: 2012, status: "discontinued", gameCount: 1391 },
  { igdbId: 42, name: "N-Gage", aliases: ["n-gage"], company: "Nokia", family: "Mobile", releaseYear: 2003, status: "discontinued", gameCount: 64 },
  { igdbId: 46, name: "PlayStation Vita", aliases: ["ps vita", "playstation vita", "vita"], company: "Sony", family: "Sony", releaseYear: 2011, status: "discontinued", gameCount: 2630 },
  { igdbId: 48, name: "PlayStation 4", aliases: ["playstation 4", "ps4"], company: "Sony", family: "Sony", releaseYear: 2013, status: "active", gameCount: 12190 },
  { igdbId: 49, name: "Xbox One", aliases: ["xbox one"], company: "Microsoft", family: "Microsoft", releaseYear: 2013, status: "active", gameCount: 9141 },
  { igdbId: 50, name: "3DO Interactive Multiplayer", aliases: ["3do", "3do interactive multiplayer"], company: "The 3DO Company", family: "Other", releaseYear: 1993, status: "discontinued", gameCount: 256 },
  { igdbId: 52, name: "Arcade", aliases: ["arcade"], company: "", family: "Arcade", releaseYear: null, status: "active", gameCount: 3653 },
  { igdbId: 57, name: "WonderSwan", aliases: ["wonderswan"], company: "Bandai", family: "Other", releaseYear: 1999, status: "discontinued", gameCount: 108 },
  { igdbId: 59, name: "Atari 2600", aliases: ["atari 2600"], company: "Atari", family: "Atari", releaseYear: 1977, status: "discontinued", gameCount: 676 },
  { igdbId: 60, name: "Atari 7800", aliases: ["atari 7800"], company: "Atari", family: "Atari", releaseYear: 1986, status: "discontinued", gameCount: 86 },
  { igdbId: 63, name: "Atari ST/STE", aliases: ["atari st", "atari st/ste"], company: "Atari", family: "Atari", releaseYear: 1985, status: "discontinued", gameCount: 2527 },
  { igdbId: 64, name: "Sega Master System/Mark III", aliases: ["sega master system", "sega master system/mark iii", "master system"], company: "Sega", family: "Sega", releaseYear: 1985, status: "discontinued", gameCount: 360 },
  { igdbId: 65, name: "Atari 8-bit", aliases: ["atari 8-bit"], company: "Atari", family: "Atari", releaseYear: 1979, status: "discontinued", gameCount: 2229 },
  { igdbId: 66, name: "Atari 5200", aliases: ["atari 5200"], company: "Atari", family: "Atari", releaseYear: 1982, status: "discontinued", gameCount: 95 },
  { igdbId: 71, name: "Commodore VIC-20", aliases: ["vic-20", "commodore vic-20", "vic 20"], company: "Commodore", family: "PC", releaseYear: 1980, status: "discontinued", gameCount: 968 },
  { igdbId: 74, name: "Windows Phone", aliases: ["windows phone"], company: "Microsoft", family: "Mobile", releaseYear: 2010, status: "discontinued", gameCount: 867 },
  { igdbId: 78, name: "Sega CD", aliases: ["sega cd"], company: "Sega", family: "Sega", releaseYear: 1991, status: "discontinued", gameCount: 216 },
  { igdbId: 79, name: "Neo Geo MVS", aliases: ["neo geo", "neo geo mvs"], company: "SNK", family: "SNK", releaseYear: 1990, status: "discontinued", gameCount: 131 },
  { igdbId: 82, name: "Web browser", aliases: ["web browser", "web"], company: "", family: "PC", releaseYear: null, status: "active", gameCount: 14608 },
  { igdbId: 86, name: "TurboGrafx-16/PC Engine", aliases: ["turbografx-16", "turbografx", "pc engine", "turbografx-16/pc engine"], company: "NEC", family: "Other", releaseYear: 1987, status: "discontinued", gameCount: 308 },
  { igdbId: 87, name: "Virtual Boy", aliases: ["virtual boy"], company: "Nintendo", family: "Nintendo", releaseYear: 1995, status: "discontinued", gameCount: 28 },
  { igdbId: 117, name: "Philips CD-i", aliases: ["cd-i", "philips cd-i", "cdi"], company: "Philips", family: "Other", releaseYear: 1991, status: "discontinued", gameCount: 217 },
  { igdbId: 119, name: "Neo Geo Pocket", aliases: ["neo geo pocket"], company: "SNK", family: "SNK", releaseYear: 1998, status: "discontinued", gameCount: 10 },
  { igdbId: 120, name: "Neo Geo Pocket Color", aliases: ["neo geo pocket color"], company: "SNK", family: "SNK", releaseYear: 1999, status: "discontinued", gameCount: 76 },
  { igdbId: 123, name: "WonderSwan Color", aliases: ["wonderswan color"], company: "Bandai", family: "Other", releaseYear: 2000, status: "discontinued", gameCount: 50 },
  { igdbId: 125, name: "PC-8800 Series", aliases: ["pc-88", "pc-8800 series"], company: "NEC", family: "PC", releaseYear: 1981, status: "discontinued", gameCount: 690 },
  { igdbId: 130, name: "Nintendo Switch", aliases: ["nintendo switch", "switch"], company: "Nintendo", family: "Nintendo", releaseYear: 2017, status: "active", gameCount: 13858 },
  { igdbId: 132, name: "Amazon Fire TV", aliases: ["fire tv", "amazon fire tv"], company: "Amazon", family: "Mobile", releaseYear: 2014, status: "active", gameCount: 114 },
  { igdbId: 133, name: "Odyssey 2 / Videopac G7000", aliases: ["odyssey 2", "odyssey 2 / videopac g7000", "videopac"], company: "Magnavox", family: "Other", releaseYear: 1978, status: "discontinued", gameCount: 118 },
  { igdbId: 136, name: "Neo Geo CD", aliases: ["neo geo cd"], company: "SNK", family: "SNK", releaseYear: 1994, status: "discontinued", gameCount: 101 },
  { igdbId: 137, name: "New Nintendo 3DS", aliases: ["new nintendo 3ds"], company: "Nintendo", family: "Nintendo", releaseYear: 2014, status: "discontinued", gameCount: 126 },
  { igdbId: 149, name: "PC-9800 Series", aliases: ["pc-98", "pc-9800 series"], company: "NEC", family: "PC", releaseYear: 1982, status: "discontinued", gameCount: 1448 },
  { igdbId: 150, name: "Turbografx-16/PC Engine CD", aliases: ["turbografx cd", "turbografx-16/pc engine cd", "pc engine cd"], company: "NEC", family: "Other", releaseYear: 1988, status: "discontinued", gameCount: 419 },
  { igdbId: 157, name: "NEC PC-6000 Series", aliases: ["pc-6001", "nec pc-6000 series"], company: "NEC", family: "PC", releaseYear: 1981, status: "discontinued", gameCount: 149 },
  { igdbId: 159, name: "Nintendo DSi", aliases: ["nintendo dsi", "dsi"], company: "Nintendo", family: "Nintendo", releaseYear: 2008, status: "discontinued", gameCount: 644 },
  { igdbId: 166, name: "Pokémon mini", aliases: ["pokemon mini", "pokémon mini"], company: "Nintendo", family: "Nintendo", releaseYear: 2001, status: "discontinued", gameCount: 10 },
  { igdbId: 167, name: "PlayStation 5", aliases: ["playstation 5", "ps5"], company: "Sony", family: "Sony", releaseYear: 2020, status: "active", gameCount: 4848 },
  { igdbId: 169, name: "Xbox Series X|S", aliases: ["xbox series", "xbox series x|s", "xbox series x", "xbox series s"], company: "Microsoft", family: "Microsoft", releaseYear: 2020, status: "active", gameCount: 5112 },
  { igdbId: 170, name: "Google Stadia", aliases: ["stadia", "google stadia"], company: "Google", family: "Other", releaseYear: 2019, status: "discontinued", gameCount: 307 },
  { igdbId: 240, name: "Zeebo", aliases: ["zeebo"], company: "", family: "Other", releaseYear: 2009, status: "discontinued", gameCount: 58 },
  { igdbId: 274, name: "PC-FX", aliases: ["pc-fx", "pc fx"], company: "NEC", family: "Other", releaseYear: 1994, status: "discontinued", gameCount: 62 },
  { igdbId: 339, name: "Sega Pico", aliases: ["sega pico", "pico"], company: "Sega", family: "Sega", releaseYear: 1993, status: "discontinued", gameCount: 30 },
  { igdbId: 373, name: "Sinclair ZX81", aliases: ["zx81", "sinclair zx81"], company: "Sinclair", family: "PC", releaseYear: 1981, status: "discontinued", gameCount: 311 },
  { igdbId: 387, name: "Oculus Go", aliases: ["oculus go"], company: "Oculus", family: "Mobile", releaseYear: 2018, status: "discontinued", gameCount: 263 },
  { igdbId: 405, name: "Windows Mobile", aliases: ["windows mobile"], company: "Microsoft", family: "Mobile", releaseYear: null, status: "discontinued", gameCount: 347 },
  { igdbId: 508, name: "Nintendo Switch 2", aliases: ["nintendo switch 2", "switch 2"], company: "Nintendo", family: "Nintendo", releaseYear: 2025, status: "active", gameCount: 299 },
];

function normalizePlatformName(value: string): string {
  return value.trim().toLowerCase();
}

const idByName = new Map<string, number>();
for (const entry of IGDB_PLATFORM_CATALOG) {
  idByName.set(normalizePlatformName(entry.name), entry.igdbId);
  for (const alias of entry.aliases) {
    const key = normalizePlatformName(alias);
    if (!idByName.has(key)) idByName.set(key, entry.igdbId);
  }
}

// Company → platform ids (first catalog entry wins per normalized name;
// a company expands to every platform carrying it, preserving catalog
// order). Lets users type "Sony", "Nintendo", "Sega" in a platform
// filter instead of guessing exact console names.
const idsByCompany = new Map<string, number[]>();
for (const entry of IGDB_PLATFORM_CATALOG) {
  const company = entry.company.trim();
  if (!company) continue;
  const key = normalizePlatformName(company);
  const list = idsByCompany.get(key) ?? [];
  if (!list.includes(entry.igdbId)) list.push(entry.igdbId);
  idsByCompany.set(key, list);
}

export function resolveIgdbPlatformId(name: string): number | undefined {
  return idByName.get(normalizePlatformName(name));
}

/**
 * Resolve Save State platform filter values (comma-joined by the UI for
 * multi-platform contexts like generations) to IGDB ids. Each part
 * resolves by exact name/alias first, then by manufacturer (expanding to
 * every platform of that company). Unknown names are reported, never
 * guessed.
 */
export function resolveIgdbPlatformIds(value: string): {
  ids: number[];
  unresolved: string[];
} {
  const ids: number[] = [];
  const unresolved: string[] = [];
  for (const part of value.split(",")) {
    const name = part.trim();
    if (!name) continue;
    const id = resolveIgdbPlatformId(name);
    if (id !== undefined) {
      if (!ids.includes(id)) ids.push(id);
      continue;
    }
    const companyIds = idsByCompany.get(normalizePlatformName(name));
    if (companyIds === undefined || companyIds.length === 0) {
      unresolved.push(name);
      continue;
    }
    for (const companyId of companyIds) {
      if (!ids.includes(companyId)) ids.push(companyId);
    }
  }
  return { ids, unresolved };
}

export function findCatalogPlatform(
  igdbId: number,
): IgdbCatalogPlatform | undefined {
  return IGDB_PLATFORM_CATALOG.find((entry) => entry.igdbId === igdbId);
}

export function catalogPlatformsByFamily(family: string): IgdbCatalogPlatform[] {
  const key = family.trim().toLowerCase();
  return IGDB_PLATFORM_CATALOG.filter(
    (entry) => entry.family.toLowerCase() === key,
  );
}
