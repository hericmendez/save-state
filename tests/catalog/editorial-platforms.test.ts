/**
 * Plataformas editoriais (Opção B): identidade, ordem, lookup e o
 * mapeamento explícito editorial → IGDB (puro, sem I/O de rede).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import raw from "@/atp-platforms-simplified.json";
import {
  editorialPlatformHref,
  findEditorialPlatform,
  listEditorialPlatforms,
  paginatePlatforms,
  parsePlatformsQuery,
  resolveEditorialIgdbIds,
  resolvePlatformThumb,
  serializePlatformsQuery,
} from "@/features/catalog/editorial-platforms";

describe("editorial platform directory", () => {
  it("renders every JSON entry in editorial order", () => {
    const platforms = listEditorialPlatforms();
    expect(platforms).toHaveLength((raw as unknown[]).length);
    expect(platforms).toHaveLength(66);
    expect(platforms.map((p) => p.id)).toEqual(
      (raw as Array<{ id: string }>).map((entry) => entry.id),
    );
  });

  it("keeps ids unique with the required card fields", () => {
    const platforms = listEditorialPlatforms();
    const ids = platforms.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const platform of platforms) {
      expect(platform.id.trim()).not.toBe("");
      expect(platform.name.trim()).not.toBe("");
      expect(platform.company).toBeDefined();
      expect(platform.type.trim()).not.toBe("");
      expect(
        platform.releaseYear === null ||
          Number.isInteger(platform.releaseYear),
      ).toBe(true);
    }
  });

  it("finds entries by slug and misses unknown ids", () => {
    expect(findEditorialPlatform("nintendo-switch")?.name).toBe(
      "Nintendo Switch",
    );
    expect(findEditorialPlatform("xbox-series")?.name).toBe("Xbox Series");
    expect(findEditorialPlatform("nope")).toBeNull();
  });

  it("normalizes the string releaseYear without rewriting the JSON", () => {
    expect(findEditorialPlatform("playstation-5")?.releaseYear).toBe(2020);
    expect(findEditorialPlatform("pc")?.releaseYear).toBeNull();
  });
});

describe("editorial → IGDB resolution", () => {
  it("resolves catalog names directly (no fallback needed)", () => {
    const ps5 = findEditorialPlatform("playstation-5");
    if (!ps5) throw new Error("playstation-5 missing");
    expect(resolveEditorialIgdbIds(ps5)).toEqual([167]);

    const snes = findEditorialPlatform("super-nintendo-entertainment-system");
    if (!snes) throw new Error("snes missing");
    expect(resolveEditorialIgdbIds(snes)).toEqual([19]);
  });

  it("prefers the catalog match over multi-id ATP links", () => {
    // The ATP curation links `nintendo-3ds` to [37, 137], but Save State's
    // IGDB catalog treats "Nintendo 3DS" (37) and "New Nintendo 3DS" (137)
    // as distinct platforms. Primary catalog resolution wins so the
    // detail filter keeps existing catalog semantics.
    const n3ds = findEditorialPlatform("nintendo-3ds");
    if (!n3ds) throw new Error("nintendo-3ds missing");
    expect(resolveEditorialIgdbIds(n3ds)).toEqual([37]);
  });

  it("covers catalog gaps with the explicit fallback table", () => {
    const jaguar = findEditorialPlatform("atari-jaguar");
    if (!jaguar) throw new Error("atari-jaguar missing");
    expect(resolveEditorialIgdbIds(jaguar)).toEqual([62]);

    const sg1000 = findEditorialPlatform("sg-1000");
    if (!sg1000) throw new Error("sg-1000 missing");
    expect(resolveEditorialIgdbIds(sg1000)).toEqual([84]);

    const pcdos = findEditorialPlatform("pc-dos");
    if (!pcdos) throw new Error("pc-dos missing");
    expect(resolveEditorialIgdbIds(pcdos)).toEqual([13]);
  });

  it("leaves Neo Geo AES without an IGDB link (empty game state)", () => {
    const neoGeo = findEditorialPlatform("neo-geo");
    if (!neoGeo) throw new Error("neo-geo missing");
    expect(resolveEditorialIgdbIds(neoGeo)).toEqual([]);
  });
});

describe("curated local thumbs (save-state)", () => {
  const byId = new Map(
    listEditorialPlatforms().map((platform) => [platform.id, platform]),
  );

  it("points odyssey-2 at its vendored photo", () => {
    expect(byId.get("odyssey-2")?.thumb.image).toBe(
      "/platforms/odyssey-2/photo.webp",
    );
  });

  it("points pc-dos at its vendored logo without query junk", () => {
    const logo = byId.get("pc-dos")?.thumb.logo ?? "";
    expect(logo).toBe("/platforms/pc-dos/logo.svg");
    expect(logo.endsWith("?")).toBe(false);
  });

  it("sega-master-system logo/image sit in their conventional fields", () => {
    // Regression guard: a previous curation had these two inverted.
    const sms = byId.get("sega-master-system");
    expect(sms?.thumb.logo).toBe("/platforms/sega-master-system/logo.svg");
    expect(sms?.thumb.image).toBe("/platforms/sega-master-system/photo.webp");
  });
});

describe("PlatformCard editorial navigation (Parte A)", () => {
  // The card href rule lives in `editorialPlatformHref` (shared by the
  // listing card) so navigation is tested as behavior. Full `.tsx` render
  // is not possible in this repo's vitest setup: any `.tsx` value import
  // fails in `vite:import-analysis` under `jsx: preserve` (same
  // pre-existing toolchain limitation as `game-form.tsx` in
  // `edit-and-add-form.test.ts`), unrelated to this change.
  it("links every platform to its editorial detail slug", () => {
    const platforms = listEditorialPlatforms();
    expect(platforms).toHaveLength(66);
    for (const platform of platforms) {
      expect(editorialPlatformHref(platform)).toBe(
        `/catalog/platforms/${platform.id}`,
      );
    }
  });

  it("keeps thumbs as local public paths (or null) without query junk", () => {
    for (const platform of listEditorialPlatforms()) {
      for (const url of [platform.thumb.logo, platform.thumb.image]) {
        if (url === null) continue;
        expect(url.startsWith("/platforms/")).toBe(true);
        expect(url.startsWith("https://")).toBe(false);
        expect(url.startsWith("http://")).toBe(false);
        expect(url.trim()).toBe(url);
        expect(url.endsWith("?")).toBe(false);
        expect(/\.(jpgg|pngg|svgg)$/i.test(url)).toBe(false);
      }
    }
  });

  it("keeps the gamecube photo local with a null logo (no asset)", () => {
    expect(findEditorialPlatform("nintendo-gamecube")?.thumb.image).toBe(
      "/platforms/nintendo-gamecube/photo.webp",
    );
    expect(findEditorialPlatform("nintendo-gamecube")?.thumb.logo).toBeNull();
  });

  it("keeps platforms without assets as explicit null thumbs", () => {
    for (const id of ["fire-tv", "html5-web"]) {
      const platform = findEditorialPlatform(id);
      expect(platform).not.toBeNull();
      expect(platform?.thumb.logo).toBeNull();
      expect(platform?.thumb.image).toBeNull();
    }
  });
});

describe("detail route editorial header (Opção B, Parte A + streaming Fase 2)", () => {
  const page = readFileSync(
    "app/(app)/catalog/platforms/[platformId]/page.tsx",
    "utf8",
  );

  it("titles the resolved branch with the editorial name", () => {
    expect(page).toContain(
      "<h1 className=\"font-display text-2xl\">{editorial.name}</h1>",
    );
  });

  it("locks the search with the editorial name plus validated ids", () => {
    // Documented equivalent union: the editorial name resolves to the
    // same validated id set (primary match, else explicit fallback).
    expect(page).toContain("fixedPlatforms={[editorial.name]}");
    expect(page).toContain(
      "fixedPlatformIds={igdbIds.length > 0 ? igdbIds : undefined}",
    );
  });

  it("streams: search renders immediately, only the count suspends", () => {
    expect(page).toContain("Suspense");
    expect(page).toContain("PlatformGameCount");
    expect(page).toContain('fallback={');
    // The editorial branch awaits nothing before rendering the search:
    // no blocking catalog lookup remains on that path.
    const editorialBranch = page.slice(
      page.indexOf("if (editorial)"),
      page.indexOf("let platform;"),
    );
    expect(editorialBranch).not.toContain("await getCatalogPlatform");
  });

  it("degrades the count line without breaking the page", () => {
    const child = readFileSync(
      "app/(app)/catalog/platforms/[platformId]/platform-game-count.tsx",
      "utf8",
    );
    expect(child).toContain("getCatalogPlatform");
    expect(child).toContain("return null");
    expect(child).toContain("no catálogo");
  });

  it("passes numeric slugs through to the legacy catalog lookup", () => {
    expect(findEditorialPlatform("130")).toBeNull();
    expect(page).toContain("getCatalogPlatform(decoded)");
    expect(page).toContain("notFound()");
  });

  it("unknown slugs resolve to no editorial entry without throwing", () => {
    expect(findEditorialPlatform("nope")).toBeNull();
  });
});

describe("platforms grid pagination (query state, pure)", () => {
  it("defaults to page 1 with 16 per page", () => {
    expect(parsePlatformsQuery(undefined)).toEqual({ page: 1, limit: 16 });
    expect(parsePlatformsQuery({})).toEqual({ page: 1, limit: 16 });
    expect(
      parsePlatformsQuery(new URLSearchParams()),
    ).toEqual({ page: 1, limit: 16 });
  });

  it("accepts the allowed page sizes and normalizes anything else", () => {
    for (const limit of [8, 12, 16, 24]) {
      expect(parsePlatformsQuery({ limit: String(limit) }).limit).toBe(limit);
    }
    for (const raw of ["20", "10", "0", "-8", "abc", "1.5", ""]) {
      expect(parsePlatformsQuery({ limit: raw }).limit).toBe(16);
    }
  });

  it("normalizes non-positive and non-integer pages to 1", () => {
    for (const raw of ["0", "-3", "1.5", "abc", ""]) {
      expect(parsePlatformsQuery({ page: raw }).page).toBe(1);
    }
    expect(parsePlatformsQuery({ page: "3" }).page).toBe(3);
    expect(
      parsePlatformsQuery(new URLSearchParams("page=2&limit=8")),
    ).toEqual({ page: 2, limit: 8 });
  });

  it("splits the 66 editorial entries into 5 pages of 16, order kept", () => {
    const platforms = listEditorialPlatforms();
    const first = paginatePlatforms(platforms, { page: 1, limit: 16 });
    expect(first.totalPages).toBe(5);
    expect(first.page).toBe(1);
    expect(first.items).toHaveLength(16);
    expect(first.items.map((p) => p.id)).toEqual(
      platforms.slice(0, 16).map((p) => p.id),
    );
    const last = paginatePlatforms(platforms, { page: 5, limit: 16 });
    expect(last.items).toHaveLength(2);
    expect(last.items.map((p) => p.id)).toEqual(
      platforms.slice(64).map((p) => p.id),
    );
  });

  it("covers every entry exactly once across all pages", () => {
    const platforms = listEditorialPlatforms();
    const seen: string[] = [];
    const { totalPages } = paginatePlatforms(platforms, {
      page: 1,
      limit: 16,
    });
    for (let page = 1; page <= totalPages; page += 1) {
      seen.push(
        ...paginatePlatforms(platforms, { page, limit: 16 }).items.map(
          (p) => p.id,
        ),
      );
    }
    expect(seen).toEqual(platforms.map((p) => p.id));
  });

  it("clamps out-of-range pages to the nearest valid page", () => {
    const platforms = listEditorialPlatforms();
    expect(
      paginatePlatforms(platforms, { page: 99, limit: 16 }).page,
    ).toBe(5);
    expect(
      paginatePlatforms(platforms, { page: 99, limit: 16 }).items,
    ).toHaveLength(2);
    expect(
      paginatePlatforms(platforms, { page: 99, limit: 8 }).page,
    ).toBe(9);
  });

  it("bounds card images per page (16 cards → at most 32)", () => {
    const platforms = listEditorialPlatforms();
    const { items } = paginatePlatforms(platforms, { page: 2, limit: 16 });
    const imageCount = items.reduce(
      (total, p) =>
        total + (p.thumb.logo ? 1 : 0) + (p.thumb.image ? 1 : 0),
      0,
    );
    expect(imageCount).toBeLessThanOrEqual(32);
  });

  it("round-trips pagination state through the query string", () => {
    expect(serializePlatformsQuery({})).toBe("");
    expect(serializePlatformsQuery({ page: 1, limit: 16 })).toBe("");
    const qs = serializePlatformsQuery({ page: 3, limit: 8 });
    expect(parsePlatformsQuery(new URLSearchParams(qs))).toEqual({
      page: 3,
      limit: 8,
    });
  });
});

describe("platforms listing pagination (source contract)", () => {
  const page = readFileSync(
    "app/(app)/catalog/platforms/page.tsx",
    "utf8",
  );

  it("reads page/limit from searchParams and slices locally (no IGDB)", () => {
    expect(page).toContain("parsePlatformsQuery(await searchParams)");
    expect(page).toContain("paginatePlatforms(platforms, query)");
    expect(page).toContain("items.map((platform)");
    expect(page).not.toContain("platforms.map((platform)");
    expect(page).not.toContain("getCatalogPlatform");
  });

  it("renders prev/next links with a current-page indicator", () => {
    expect(page).toContain('aria-label="Paginação de plataformas"');
    expect(page).toContain("Anterior");
    expect(page).toContain("Próxima");
    expect(page).toContain('aria-current="page"');
    expect(page).toContain("Página");
    expect(page).toContain("{page} de {totalPages}");
  });

  it("offers 8/12/16/24 page sizes through a GET form", () => {
    expect(page).toContain('method="get"');
    expect(page).toContain('name="limit"');
    expect(page).toContain("PLATFORM_PAGE_SIZES");
    expect(page).toContain('name="page" value="1"');
  });

  it("resolves card images local-first with remote fallback", () => {
    expect(page).toContain("resolvePlatformThumb(platform, manifest)");
    expect(page).toContain("loadPlatformAssetManifest");
    expect(page).toContain("public");
    expect(page).toContain("manifest.json");
    expect(page).toContain("/catalog/platforms/atribuicoes");
  });
});

describe("resolvePlatformThumb (local-first, pure)", () => {
  const fixture = {
    version: 1,
    files: {
      "3do/logo": {
        file: "3do/logo.png",
        source: "https://upload.wikimedia.org/x",
        page: null,
        license: "Public domain",
        licenseUrl: null,
        author: null,
      },
      "3do/image": {
        file: "3do/photo.webp",
        source: "https://upload.wikimedia.org/y",
        page: null,
        license: "CC BY-SA 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
        author: "Someone",
      },
    },
  };

  it("prefers vendored copies when the manifest lists them", () => {
    const platform = findEditorialPlatform("3do");
    if (!platform) throw new Error("3do missing");
    expect(resolvePlatformThumb(platform, fixture)).toEqual({
      logo: "/platforms/3do/logo.png",
      image: "/platforms/3do/photo.webp",
    });
  });

  it("falls back to the JSON local paths when the manifest is partial", () => {
    const platform = findEditorialPlatform("3do");
    if (!platform) throw new Error("3do missing");
    expect(
      resolvePlatformThumb(platform, { version: 1, files: {} }),
    ).toEqual({
      logo: platform.thumb.logo,
      image: platform.thumb.image,
    });
    expect(resolvePlatformThumb(platform, null)).toEqual({
      logo: platform.thumb.logo,
      image: platform.thumb.image,
    });
    expect(resolvePlatformThumb(platform, undefined)).toEqual({
      logo: platform.thumb.logo,
      image: platform.thumb.image,
    });
  });

  it("never mixes platforms (slug-scoped keys)", () => {
    const android = findEditorialPlatform("android");
    if (!android) throw new Error("android missing");
    // Fixture only covers 3do: android must stay on its JSON paths.
    expect(resolvePlatformThumb(android, fixture)).toEqual({
      logo: android.thumb.logo,
      image: android.thumb.image,
    });
  });

  it("passes null thumbs through for the visual fallback", () => {
    const fireTv = findEditorialPlatform("fire-tv");
    if (!fireTv) throw new Error("fire-tv missing");
    expect(fireTv.thumb).toEqual({ logo: null, image: null });
    expect(resolvePlatformThumb(fireTv, fixture)).toEqual({
      logo: null,
      image: null,
    });
    expect(resolvePlatformThumb(fireTv, null)).toEqual({
      logo: null,
      image: null,
    });
  });
});

describe("editorial dataset integrity (local assets)", () => {
  const entries = raw as Array<{
    id: string;
    name: string;
    company: string;
    releaseYear: string | number | null;
    type: string;
    thumb: { logo: string | null; image: string | null } | null;
  }>;

  it("holds 66 records with unique ids", () => {
    expect(entries).toHaveLength(66);
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no external URLs in thumb fields", () => {
    for (const entry of entries) {
      for (const url of [entry.thumb?.logo, entry.thumb?.image]) {
        if (url === null || url === undefined) continue;
        expect(url.startsWith("http://")).toBe(false);
        expect(url.startsWith("https://")).toBe(false);
        expect(url.startsWith("/platforms/")).toBe(true);
      }
    }
  });

  it("points every non-null thumb at a file that exists on disk", () => {
    const missing: string[] = [];
    for (const entry of entries) {
      for (const url of [entry.thumb?.logo, entry.thumb?.image]) {
        if (url === null || url === undefined) continue;
        const relative = url.replace(/^\/+/, "");
        if (!existsSync(join(process.cwd(), "public", relative))) {
          missing.push(`${entry.id}:${url}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("preserves the editorial metadata alongside the new thumbs", () => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    expect(byId.get("playstation-2")).toMatchObject({
      name: "PlayStation 2",
      company: "Sony",
      releaseYear: "2000",
      type: "console",
    });
    expect(byId.get("sega-master-system")).toMatchObject({
      name: "Sega Master System",
      company: "Sega",
      releaseYear: "1985",
      type: "console",
    });
    expect(byId.get("pc")).toMatchObject({
      name: "PC",
      company: "Various",
      releaseYear: null,
    });
  });

  it("has no orphaned vendored assets outside the catalog ids", () => {
    const manifest = JSON.parse(
      readFileSync("public/platforms/manifest.json", "utf8"),
    ) as { files: Record<string, unknown> };
    const ids = new Set(entries.map((entry) => entry.id));
    const orphans = Object.keys(manifest.files).filter((key) => {
      const slug = key.split("/")[0];
      return !ids.has(slug);
    });
    expect(orphans).toEqual([]);
  });

  it("renders the card fallbacks when logo/image are absent", () => {
    const card = readFileSync("features/catalog/platform-card.tsx", "utf8");
    // Initial-letter logo fallback + photo placeholder, both with
    // onError recovery so one missing asset never breaks the grid.
    expect(card).toContain("charAt(0).toUpperCase()");
    expect(card).toContain("Image not found");
    expect(card).toContain("setFailed(true)");
  });
});
